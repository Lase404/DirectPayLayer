'use client'

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { SwapWidget, SlippageToleranceConfig, RelayKitProvider } from '@reservoir0x/relay-kit-ui'
import { useAccount, useWalletClient } from 'wagmi'
import { SUPPORTED_CHAINS } from '@/utils/bridge'
import { usePrivy } from '@privy-io/react-auth'
import '@/styles/relay-overrides.css'
import { getRatesForOfframp } from '@/utils/paycrest'
import { adaptViemWallet } from '@reservoir0x/relay-sdk'
import { adaptSolanaWallet } from '@/utils/solanaAdapter'
import { Connection, Transaction, VersionedTransaction } from '@solana/web3.js'
import axios from 'axios'
import { convertViemChainToRelayChain, MAINNET_RELAY_API } from '@reservoir0x/relay-sdk'
import { mainnet } from '@wagmi/core/chains'
import '@reservoir0x/relay-kit-ui/styles.css'
import { useRelayChains } from '@reservoir0x/relay-kit-hooks'
import { type WalletClient } from 'viem'
import { User } from '@privy-io/react-auth'
import TransactionStatusModal, { TransactionStatus, BankAccount } from './TransactionStatusModal'
import TransactionStatusPopup from './TransactionStatusPopup'

// Define OrderStatus type
type OrderStatus = 'initiated' | 'settled' | 'refunded' | 'expired';

// Define token type
interface Token {
  chainId: number
  address: string
  decimals: number
  name: string
  symbol: string
  logoURI: string
}

// Extend XMLHttpRequest type to allow our custom property
declare global {
  interface XMLHttpRequest {
    _relayUrl?: string;
  }
}

// Add type declarations for Solflare and Phantom at the top of the file
declare global {
  interface Window {
    solflare?: {
      connect: () => Promise<any>;
      signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
    };
    phantom?: {
      solana?: {
        connect: () => Promise<any>;
        signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
      };
    };
  }
}

// Constants
const DEFAULT_DESTINATION_ADDRESS = '0x1a84de15BD8443d07ED975a25887Fc4E6779DfaF' // Only used for Solana wallets in Paycrest orders
const DEFAULT_RATE = 1600
const ORDER_REFRESH_INTERVAL = 60 * 1000 // 1 minute in milliseconds
const ORDER_CHECK_INTERVAL = 30 * 1000 // Check every 30 seconds

// Helper function to detect Solana addresses
const isSolanaAddress = (address: string): boolean => {
  // Solana addresses are base58 encoded strings, typically 32-44 characters
  // They don't start with 0x like Ethereum addresses
  return typeof address === 'string' && 
         !address.startsWith('0x') && 
         /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// Helper function to ensure valid return address for Paycrest orders
const getValidReturnAddress = (address: string, isPaycrestOrder: boolean = false): string => {
  if (isSolanaAddress(address) || !address.startsWith('0x')) {
    console.log('Non-EVM address detected, replacing with default destination:', address);
    return DEFAULT_DESTINATION_ADDRESS;
  }
  return address;
}

// Update the network request interceptors
if (typeof window !== 'undefined') {
  // Intercept fetch API
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    try {
      const [resource, options] = args;
      
      // Check if this is a Paycrest API request
      if (typeof resource === 'string' && resource.includes('paycrest.io')) {
        // Check if this is a POST request with a body
        if (options && options.body && typeof options.body === 'string') {
          try {
            const body = JSON.parse(options.body);
            // Check if the body contains a returnAddress field
            if (body.returnAddress) {
              const validReturnAddress = getValidReturnAddress(body.returnAddress, true);
              if (body.returnAddress !== validReturnAddress) {
                console.log(`API route: Replacing Solana return address in Paycrest order: ${body.returnAddress} → ${validReturnAddress}`);
                body.returnAddress = validReturnAddress;
                
                // Create new options with fixed body
                const newOptions = {
                  ...options,
                  body: JSON.stringify(body)
                };
                
                console.log('Sending validated Paycrest order payload:', body);
                return originalFetch.apply(this, [resource, newOptions]);
              }
            }
          } catch (e) {
            console.error('Error parsing fetch body:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error in fetch interceptor:', error);
    }
    
    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(
    method: string, 
    url: string | URL, 
    async: boolean = true, 
    username?: string | null, 
    password?: string | null
  ) {
    this._relayUrl = url?.toString();
    return originalXHROpen.call(this, method, url, async, username || null, password || null);
  };

  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
    try {
      if (this._relayUrl && typeof this._relayUrl === 'string') {
        if (this._relayUrl.includes('paycrest.io') && body && typeof body === 'string') {
          try {
            const data = JSON.parse(body);
            if (data.returnAddress) {
              const validReturnAddress = getValidReturnAddress(data.returnAddress, true);
              if (data.returnAddress !== validReturnAddress) {
                console.log(`API route: Replacing Solana return address in Paycrest order: ${data.returnAddress} → ${validReturnAddress}`);
                data.returnAddress = validReturnAddress;
                return originalXHRSend.call(this, JSON.stringify(data));
              }
            }
          } catch (e) {
            console.error('Error parsing XHR body:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error in XHR send interceptor:', error);
    }
    
    return originalXHRSend.call(this, body);
  };

  // Intercept Axios
  axios.interceptors.request.use(config => {
    try {
      if (config.url && config.url.includes('paycrest.io') && config.data) {
        if (config.data.returnAddress) {
          const validReturnAddress = getValidReturnAddress(config.data.returnAddress, true);
          if (config.data.returnAddress !== validReturnAddress) {
            console.log(`API route: Replacing Solana return address in Paycrest order: ${config.data.returnAddress} → ${validReturnAddress}`);
            config.data.returnAddress = validReturnAddress;
          }
        }
      }
    } catch (error) {
      console.error('Error in axios interceptor:', error);
    }
    return config;
  });
}

// Define interface for Privy wallet account with correct types
interface PrivyWalletAccount {
  type: string;
  walletClientType?: string;
  address: string;
  latestVerifiedAt: Date | null;
  chainType?: string;
}

// Add interface for Privy linked account metadata
interface LinkedAccountWithMetadata {
  type: string;
  walletClientType?: string;
  chainType?: string;
  latestVerifiedAt: Date | null;
  address?: string;
  connectorType?: string;
  verifiedAt?: Date | null;
  firstVerifiedAt?: Date | null;
}

interface SolanaWalletInterface {
  publicKey: string;
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  signAllTransactions: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  sendTransaction: (transaction: Transaction | VersionedTransaction, connection: Connection) => Promise<{ signature: string }>;
}

// Update the component to accept props
interface SwapWidgetWrapperProps {
  onSwapSuccess?: (bankDetails?: any) => Promise<string | null>;
}

// Move setupWallet function outside useEffect and component
export const setupWallet = async (
  ready: boolean,
  user: User | null,
  walletClient: WalletClient | null,
  setAdaptedWallet: (wallet: any) => void,
  setWalletType: React.Dispatch<React.SetStateAction<'evm' | 'svm' | null>>,
  setError: (error: string | null) => void
) => {
  if (!ready || !user) return;
      
  try {
    // Enhanced logging for wallet detection
    console.log("Checking for wallets in Privy user:", {
      linkedAccounts: user.linkedAccounts,
      wallet: user.wallet
    });
        
    // Cast to unknown first, then to our type
    const allAccounts = (user.linkedAccounts || []) as unknown as LinkedAccountWithMetadata[];
    const linkedAccounts = allAccounts
      .filter((account): account is PrivyWalletAccount => {
        return (
          account.type === 'wallet' &&
          typeof account.address === 'string' &&
          account.address.length > 0
        );
      });

    console.log("All linked accounts:", linkedAccounts);

    // Sort accounts by latestVerifiedAt in descending order (most recent first)
    const sortedAccounts = [...linkedAccounts].sort((a, b) => {
      const dateA = a.latestVerifiedAt ? a.latestVerifiedAt.getTime() : 0;
      const dateB = b.latestVerifiedAt ? b.latestVerifiedAt.getTime() : 0;
      return dateB - dateA;
    });

    // Get the most recently verified wallet
    const mostRecentWallet = sortedAccounts[0];
    console.log("Most recently verified wallet:", mostRecentWallet);

    if (!mostRecentWallet) return;

    // Check if it's an EVM wallet
    if (walletClient && mostRecentWallet.chainType === 'ethereum') {
      console.log("Using EVM wallet:", mostRecentWallet);
      const evmWallet = adaptViemWallet(walletClient as any);
      setAdaptedWallet(evmWallet);
      setWalletType('evm');
      return;
    }

    // Check if it's a Solana wallet
    if (mostRecentWallet.chainType === 'solana') {
      console.log("Using Solana wallet:", mostRecentWallet);
      setWalletType('svm');
      
      try {
        // Create Solana connection
        console.log("Creating Solana connection...");
        const connection = new Connection("https://frequent-indulgent-theorem.solana-mainnet.quiknode.pro/288c090b70deb85f86ba0f2feaad99f9e56e7c2d/", {
          commitment: 'confirmed',
          httpHeaders: {
            'Content-Type': 'application/json',
          }
        });

        // Get the solana wallet from Privy's methods
        console.log("Attempting to access specific Solana wallet via Privy...");
        
        const solanaAdaptedWallet = await adaptSolanaWallet({
          publicKey: mostRecentWallet.address,
          signTransaction: async (transaction) => {
            console.log("Signing Solana transaction through Privy");
            
            if (typeof window !== 'undefined') {
              // Try Solflare first
              if (window.solflare) {
                console.log("Found Solflare in window object");
                try {
                  await window.solflare.connect();
                  const signedTx = await window.solflare.signTransaction(transaction);
                  if (signedTx) return signedTx;
                } catch (err) {
                  console.error("Error with Solflare wallet:", err);
                }
              }
              
              // Then try Phantom
              if (window.phantom?.solana) {
                console.log("Found Phantom in window object");
                try {
                  await window.phantom.solana.connect();
                  const signedTx = await window.phantom.solana.signTransaction(transaction);
                  if (signedTx) return signedTx;
                } catch (err) {
                  console.error("Error with Phantom wallet:", err);
                }
              }
            }
            
            console.error("Browser wallet signing failed and no other signing methods available");
            throw new Error("Could not sign Solana transaction - no wallet with signing capability found");
          },
          signAllTransactions: async (transactions) => {
            console.log("Signing multiple Solana transactions not implemented");
            throw new Error("Sign all transactions not implemented");
          },
          signMessage: async (message) => {
            console.log("Signing Solana message not implemented");
            throw new Error("Sign message not implemented");
          }
        });
        
        setAdaptedWallet(solanaAdaptedWallet);
        console.log("Solana wallet set in state");
      } catch (err) {
        console.error("Error setting up Solana wallet:", err);
        throw err;
      }
    }
  } catch (err) {
    console.error("Error setting up wallet:", err);
    setError("Failed to initialize wallet. Please try reconnecting.");
  }
};

export default function SwapWidgetWrapper({ onSwapSuccess }: SwapWidgetWrapperProps) {
  const { login, authenticated, user, ready, linkWallet, logout } = usePrivy()
  const { data: walletClient } = useWalletClient()
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Add chains state
  const { chains: supportedChains, isLoading: isChainsLoading } = useRelayChains(MAINNET_RELAY_API)
  const [chains, setChains] = useState<any[]>([])

  // Update chains when they're loaded
  useEffect(() => {
    if (supportedChains && !isChainsLoading) {
      console.log("Supported chains loaded:", supportedChains)
      setChains(supportedChains)
    }
  }, [supportedChains, isChainsLoading])
  
  // Simplified state
  const [nairaAmount, setNairaAmount] = useState("0.00")
  const [paycrestRate, setPaycrestRate] = useState(DEFAULT_RATE)
  const [isRateLoading, setIsRateLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outputValue, setOutputValue] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const overlayRef = useRef(null)
  const isInitialized = useRef(false)
  const [adaptedWallet, setAdaptedWallet] = useState<any>(undefined)
  const [walletType, setWalletType] = useState<'evm' | 'svm' | null>(null)
  const [destinationAddress, setDestinationAddress] = useState<string>(DEFAULT_DESTINATION_ADDRESS)
  const rateRef = useRef(DEFAULT_RATE)
  const [lastOrderTime, setLastOrderTime] = useState<number>(0)
  const { address: connectedAddress } = useAccount()
  const [orderStatus, setOrderStatus] = useState<'valid' | 'expired' | 'none'>('none')
  const lastValidOrderRef = useRef<{ address: string; timestamp: number } | null>(null)
  const [swapSuccessOccurred, setSwapSuccessOccurred] = useState(false)
  const [slippageTolerance, setSlippageTolerance] = useState<string | undefined>(undefined)
  const [showSlippageConfig, setShowSlippageConfig] = useState(false)
  
  // Add transaction tracking state
  const [transactionHistory, setTransactionHistory] = useState<TransactionStatus[]>([])
  const [showTransactionStatus, setShowTransactionStatus] = useState(false)
  const [pendingTransaction, setPendingTransaction] = useState<{
    orderId?: string;
    originToken?: { symbol: string; amount: string };
    usdcAmount?: string;
    nairaAmount?: string;
    bankDetails?: any;
  } | null>(null)
  const [currentTransaction, setCurrentTransaction] = useState<{
    orderId?: string;
    originToken?: { symbol: string; amount: string };
    usdcAmount?: string;
    nairaAmount?: string;
    bankDetails?: any;
  } | null>(null)

  // Watch for changes in the receive address
  useEffect(() => {
    const checkReceiveAddress = () => {
      const storedAddress = localStorage.getItem('paycrestReceiveAddress')
      if (storedAddress && /^0x[a-fA-F0-9]{40}$/.test(storedAddress)) {
        setDestinationAddress(storedAddress)
      }
    }

    // Check immediately
    checkReceiveAddress()

    // Set up storage event listener
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'paycrestReceiveAddress') {
        checkReceiveAddress()
      }
    }

    window.addEventListener('storage', handleStorageChange)

    // Also check periodically for local changes
    const interval = setInterval(checkReceiveAddress, 1000)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [])
  
  // Move setupWallet function outside useEffect
  useEffect(() => {
    setupWallet(ready, user, walletClient || null, setAdaptedWallet, setWalletType, setError);
  }, [ready, user, walletClient]);
  
  // Define tokens outside of render cycle
  const [fromToken, setFromTokenState] = useState<Token | undefined>(undefined);
  
  const [toToken, setToTokenState] = useState<Token>({
    chainId: SUPPORTED_CHAINS.BASE,
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6, name: 'Nigerian Naira', symbol: 'NGN',
    logoURI: 'https://crossbow.noblocks.xyz/_next/image?url=https%3A%2F%2Fflagcdn.com%2Fh24%2Fng.webp&w=48&q=75'
  });

  // Fetch Paycrest rate and update it periodically
  useEffect(() => {
    const fetchRate = async () => {
      try {
        setIsRateLoading(true)
        const rate = await getRatesForOfframp()
      if (rate && typeof rate.NGN === 'number' && isFinite(rate.NGN) && rate.NGN > 0) {
          console.log("Rate fetched successfully:", rate.NGN)
          setPaycrestRate(rate.NGN)
          rateRef.current = rate.NGN
          setError(null) // Clear any existing errors
      } else {
          console.warn("Invalid rate received, using default:", DEFAULT_RATE)
          // Don't set error for invalid rate, just use default
        }
      } catch (err) {
        console.error('Error fetching rate:', err)
        // Don't set error state for rate fetch failures
        // Just continue using the default or last known good rate
      } finally {
        setIsRateLoading(false)
      }
    }

    // Fetch immediately but don't block rendering
    setTimeout(fetchRate, 0)

    // Then fetch every 30 seconds, but only if the component is mounted
    let mounted = true
    const interval = setInterval(() => {
      if (mounted) {
        fetchRate().catch(() => {
          // Silently handle background fetch errors
        })
      }
    }, 30000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  // Intercept network requests to enforce destination address
  useEffect(() => {
    // Save original fetch
    const originalFetch = window.fetch;
    
    console.log("Setting up enhanced API request interceptor");
    
    // Replace fetch with our enhanced version
    window.fetch = async function(input, init) {
      let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : '';
      
      // Check if this is a relay API call
      if (url.includes('api.relay') || url.includes('quote')) {
        console.log("Intercepting Relay API call:", url);
        
        // Get the current order ID and check its status
        const orderId = localStorage.getItem('paycrestOrderId')
        if (orderId) {
          try {
            // Get the order details from localStorage
            const orderData = JSON.parse(localStorage.getItem('paycrestLastOrder') || '{}')
            if (orderData.receiveAddress) {
              console.log(`Using receive address from order: ${orderData.receiveAddress}`)
              // Force the correct receive address
              if (init && init.body) {
                let body;
                try {
                  const bodyText = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
                  body = JSON.parse(bodyText);
                  
                  // FORCE the recipient in ALL places it could appear
                  if (body.recipient !== orderData.receiveAddress) {
                    console.log(`Correcting recipient in API call: ${body.recipient} → ${orderData.receiveAddress}`);
                    body.recipient = orderData.receiveAddress;
                  }
                  
                  if (body.params?.recipient !== orderData.receiveAddress) {
                    console.log(`Correcting params.recipient in API call: ${body.params?.recipient} → ${orderData.receiveAddress}`);
                    body.params.recipient = orderData.receiveAddress;
                  }
                  
                  if (body.parameters?.recipient !== orderData.receiveAddress) {
                    console.log(`Correcting parameters.recipient in API call: ${body.parameters?.recipient} → ${orderData.receiveAddress}`);
                    body.parameters.recipient = orderData.receiveAddress;
                  }
                  
                  init.body = JSON.stringify(body);
                } catch (err) {
                  console.error("Error parsing/modifying fetch body:", err);
                }
              }
            }
          } catch (err) {
            console.error('Error checking order details in interceptor:', err)
          }
        }
      }
      
      return originalFetch.call(window, input, init);
    };
    
    // Also patch XMLHttpRequest with improved version
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
      // Store the URL for later use in send
      this._relayUrl = url.toString();
      originalXHROpen.call(this, method, url, async === undefined ? true : async, username, password);
    };
    
    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null): void {
      // Check if this is a relay API call
      if (this._relayUrl && (
          this._relayUrl.includes('api.relay') || 
          this._relayUrl.includes('quote'))) {
        
        console.log("Intercepting XHR to:", this._relayUrl);
        
        // If it has a body and it's a string, try to modify it
        if (body && typeof body === 'string') {
          try {
            let parsedBody = JSON.parse(body);
            let modified = false;
            
            // FORCE the recipient in ALL places it could appear
            // Direct recipient field
            if (parsedBody.recipient !== destinationAddress) {
              console.warn(`Correcting recipient in XHR: ${parsedBody.recipient} → ${destinationAddress}`);
              parsedBody.recipient = destinationAddress;
              modified = true;
            }
            
            // Check for nested recipient in params
            if (parsedBody.params && parsedBody.params.recipient !== destinationAddress) {
              console.warn(`Correcting nested recipient in XHR: ${parsedBody.params.recipient} → ${destinationAddress}`);
              parsedBody.params.recipient = destinationAddress;
              modified = true;
            }
            
            // Check for parameters.recipient
            if (parsedBody.parameters && parsedBody.parameters.recipient !== destinationAddress) {
              console.warn(`Correcting parameters.recipient in XHR: ${parsedBody.parameters.recipient} → ${destinationAddress}`);
              parsedBody.parameters.recipient = destinationAddress;
              modified = true;
            }
            
            // Check for user field
            if (parsedBody.parameters && parsedBody.parameters.user && parsedBody.parameters.user !== destinationAddress) {
              console.warn(`Correcting parameters.user in XHR: ${parsedBody.parameters.user} → ${destinationAddress}`);
              parsedBody.parameters.user = destinationAddress;
              modified = true;
            }
            
            // Check for returnAddress fields (for Paycrest API)
            if (parsedBody.returnAddress) {
              const validReturnAddress = getValidReturnAddress(parsedBody.returnAddress);
              if (parsedBody.returnAddress !== validReturnAddress) {
                console.warn(`Replacing Solana returnAddress in XHR: ${parsedBody.returnAddress} → ${validReturnAddress}`);
                parsedBody.returnAddress = validReturnAddress;
                modified = true;
              }
            }
            
            // Replace the body if modified
            if (modified) {
              body = JSON.stringify(parsedBody);
            }
          } catch (err) {
            console.error("Error parsing/modifying XHR body:", err);
          }
        }
      }
      
      originalXHRSend.call(this, body);
    };
    
    // Also patch Axios request interceptor for direct modification
    const axiosRequestInterceptor = axios.interceptors.request.use(config => {
      // Check if this is a relay API call
      if (config.url && (config.url.includes('api.relay') || config.url.includes('quote'))) {
        console.log("Intercepting Axios request to:", config.url);
        
        // If it has data, enforce our destination address
        if (config.data) {
          let modified = false;
          
          // FORCE the recipient in ALL places it could appear
          // Direct recipient field
          if (config.data.recipient !== destinationAddress) {
            console.warn(`Correcting recipient in Axios: ${config.data.recipient} → ${destinationAddress}`);
            config.data.recipient = destinationAddress;
            modified = true;
          }
          
          // Check for nested recipient in params
          if (config.data.params && config.data.params.recipient !== destinationAddress) {
            console.warn(`Correcting nested params.recipient in Axios: ${config.data.params.recipient} → ${destinationAddress}`);
            config.data.params.recipient = destinationAddress;
            modified = true;
          }
          
          // Check for parameters.recipient
          if (config.data.parameters && config.data.parameters.recipient !== destinationAddress) {
            console.warn(`Correcting parameters.recipient in Axios: ${config.data.parameters.recipient} → ${destinationAddress}`);
            config.data.parameters.recipient = destinationAddress;
            modified = true;
          }
          
          // Check for user field
          if (config.data.parameters && config.data.parameters.user && config.data.parameters.user !== destinationAddress) {
            console.warn(`Correcting parameters.user in Axios: ${config.data.parameters.user} → ${destinationAddress}`);
            config.data.parameters.user = destinationAddress;
            modified = true;
          }
          
          // Check for returnAddress fields (for Paycrest API)
          if (config.data.returnAddress) {
            const validReturnAddress = getValidReturnAddress(config.data.returnAddress);
            if (config.data.returnAddress !== validReturnAddress) {
              console.warn(`Replacing Solana returnAddress in Axios: ${config.data.returnAddress} → ${validReturnAddress}`);
              config.data.returnAddress = validReturnAddress;
              modified = true;
            }
          }
        }
      }
      
      return config;
    });
    
    // Cleanup function
    return () => {
      // Restore original fetch
      window.fetch = originalFetch;
      
      // Restore original XHR methods
      XMLHttpRequest.prototype.open = originalXHROpen;
      XMLHttpRequest.prototype.send = originalXHRSend;
      
      // Remove Axios interceptor
      axios.interceptors.request.eject(axiosRequestInterceptor);
      
      console.log("Network interceptors removed");
    };
  }, [destinationAddress]);
    
    // Function to update Naira amount based on output field
    const updateNairaAmount = () => {
    const inputFields = containerRef.current?.querySelectorAll('input[type="text"][inputmode="decimal"]')
      if (!inputFields || inputFields.length < 2) {
      console.warn("Could not find both input fields, found:", inputFields?.length)
      return
      }
      
      // Get the second input field (output/USDC amount)
    const outputField = inputFields[1] as HTMLInputElement
    const value = outputField.value.replace(/,/g, '').trim()
      
    console.log("Output field value:", value)
      
      if (value === '') {
      setNairaAmount("0.00")
      setOutputValue(0)
      return
    }
    
    // Convert the value considering USDC decimals (6 decimals for Base)
    let numValue = parseFloat(value)
      if (isNaN(numValue)) {
      console.warn("Invalid output value:", value)
      return
    }

    // Check if the value needs decimal adjustment (if it's too large)
    if (numValue > 1e9) { // If value is suspiciously large
      numValue = numValue / 1e6 // Convert from Base USDC decimals
      console.log("Adjusted USDC value for decimals:", numValue)
    }
    
    setOutputValue(numValue)
    
    // Use the current rate from ref to ensure we always have a value
    const currentRate = rateRef.current
      
      // CALCULATE NAIRA AMOUNT by converting the USDC amount to Naira
    const nairaValue = numValue * currentRate
    console.log(`Converting ${numValue} USDC to ${nairaValue} Naira (rate: ${currentRate})`)
      
    // Format as Naira with proper grouping
      const formattedNaira = nairaValue.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })
    
    console.log(`Setting Naira display to: ${formattedNaira}`)
    setNairaAmount(formattedNaira)
  }

  // Set up direct DOM observers and hide the output field
  useEffect(() => {
    if (!containerRef.current || isInitialized.current) return
    
    console.log("Setting up MutationObserver to watch output field")
    
    // Wait for component to fully mount before setting up observer
    const timerInit = setTimeout(() => {
      // Watch for changes in the DOM
      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          // Only process attribute changes
          if (mutation.type === 'attributes' && 
              mutation.attributeName === 'value' && 
              mutation.target.nodeName === 'INPUT') {
            updateNairaAmount()
          }
        }
      })
      
      if (containerRef.current) {
        // Start observing
        observer.observe(containerRef.current, {
          subtree: true,
          attributes: true,
          attributeFilter: ['value']
        })
        
        // Initial check for existing input
        setTimeout(updateNairaAmount, 300)
        
        isInitialized.current = true
      }
      
      return () => {
        observer.disconnect()
      }
    }, 500)
    
    return () => {
      clearTimeout(timerInit)
    }
  }, [])

  // Watch for changes in the destination address, whether from a new order or storage update 
  useEffect(() => {
    // When destination address changes, also ensure the SwapWidget knows about it
    if (destinationAddress && destinationAddress !== DEFAULT_DESTINATION_ADDRESS) {
      console.log('Destination address updated in component state:', destinationAddress)
      
      // Update any UI elements that need the current destination address
      // This helps ensure the address is consistent across the component
    }
  }, [destinationAddress])

  // After swap success, update the widget display
  useEffect(() => {
    // Update the quotes whenever the order status changes
    if (orderStatus === 'valid') {
      // Slight delay to ensure all state updates have propagated
      setTimeout(() => {
        // Trigger an update to refresh display values
        updateNairaAmount()
      }, 500)
    }
  }, [orderStatus])

  // Update handleSwapSuccess to show the transaction popup immediately
  async function handleSwapSuccess(data: any) {
    console.log('handleSwapSuccess function started')
    
    try {
      // Force create new order after successful swap
      console.log('Creating new order after swap success')
      await createNewOrder(true)
      
      // Get stored bank details
      const storedBank = localStorage.getItem('linkedBankAccount')
      const bankDetails = storedBank ? JSON.parse(storedBank) : null
      
      // Get current order details
      const currentOrderData = localStorage.getItem('paycrestLastOrder')
      const orderData = currentOrderData ? JSON.parse(currentOrderData) : null
      
      // Show transaction popup immediately
      if (orderData) {
        const transactionDetails = {
          orderId: orderData.id,
          originToken: {
            symbol: data?.steps?.[0]?.fromToken?.symbol || 'Unknown',
            amount: data?.steps?.[0]?.fromAmount || '0'
          },
          usdcAmount: orderData.amount,
          nairaAmount: (parseFloat(orderData.amount) * paycrestRate).toFixed(2),
          bankDetails: bankDetails
        };
        
        setCurrentTransaction(transactionDetails);
        setShowTransactionStatus(true);
        setSwapSuccessOccurred(true);
      }
      
      // If we have a parent success callback, call it
      if (onSwapSuccess) {
        console.log('Calling parent swap success handler')
        await onSwapSuccess(bankDetails)
      }
    } catch (error) {
      console.error('Failed to create new order after swap:', error)
    }
  }

  async function handleWalletConnection(connectorType?: string) {
    console.log("Wallet connection requested, type:", connectorType);
    
    if (!authenticated) {
      console.log("User not authenticated, initiating login");
      await login();
    } else if (connectorType) {
      console.log("Connecting specific wallet type:", connectorType);
      if (connectorType.toLowerCase().includes('solana') || 
          connectorType.toLowerCase().includes('phantom')) {
        console.log("Connecting Solana wallet");
        setWalletType('svm');
      }
      await linkWallet();
    } else {
      console.log("Connecting additional wallet");
      await linkWallet();
    }
  }

  function handleAnalyticEvent(e: any) {
    if (!e || !e.eventName) return

    console.log('[Widget Event]', e.eventName, e.data)

    if (e.eventName === 'QUOTE_REQUESTED' && e.data && e.data.parameters) {
      const storedReceiveAddress = localStorage.getItem('paycrestReceiveAddress');
      if (storedReceiveAddress) {
        console.log(`Setting recipient in quote request to Paycrest receive address:`, storedReceiveAddress);
        e.data.parameters.recipient = storedReceiveAddress;
      } else {
        console.warn('No Paycrest receive address found for quote request');
      }
    }
    
    if (e.eventName === 'SWAP_SUCCESS') {
      console.log("SWAP_SUCCESS EVENT DETECTED")
      console.log("Swap success data:", JSON.stringify(e.data, null, 2))
      setSwapSuccessOccurred(true)
      handleSwapSuccess(e.data)
    }

    if (e.eventName === 'SWAP_MODAL_CLOSED') {
      console.log('SWAP_MODAL_CLOSED event detected')
      // No additional actions needed when modal closes
    }
    
    // Handle wallet selector events
    if (e.eventName === 'WALLET_SELECTOR_SELECT') {
      console.log("Wallet selector triggered:", e.data)
      if (e.data && e.data.context === 'not_connected') {
        console.log("Initiating wallet connection flow")
        
        if (e.data.wallet_type && 
            (e.data.wallet_type.toLowerCase().includes('solana') ||
             e.data.wallet_type.toLowerCase().includes('phantom') ||
             e.data.wallet_type.toLowerCase().includes('svm'))) {
          console.log("Setting wallet type to Solana")
          setWalletType('svm')
        }
        
        handleWalletConnection(e.data.wallet_type)
      }
    }
    
    // Dispatch custom event for external listeners
    const customEvent = new CustomEvent('relay-analytic', { detail: { eventName: e.eventName, data: e.data } })
    window.dispatchEvent(customEvent)
  }

  // Setup event listeners
  useEffect(() => {
    window.addEventListener('relay-analytic', handleAnalyticEvent)
    return () => window.removeEventListener('relay-analytic', handleAnalyticEvent)
  }, [])

  // Hide the output field - run this only once after mounting
  useLayoutEffect(() => {
    const hideOutputField = () => {
      if (!containerRef.current) return;
      
      const checkAndHide = () => {
        const inputFields = containerRef.current?.querySelectorAll('input[type="text"][inputmode="decimal"]');
        if (!inputFields || inputFields.length < 2) return false;
        
        // Get the second field (output)
        const outputField = inputFields[1] as HTMLInputElement;
        if (!outputField) return false;
        
        // Hide the original field
        outputField.style.opacity = '0';
        outputField.style.pointerEvents = 'none';
        return true;
      };
      
      // Try immediately
      if (!checkAndHide()) {
        // If not successful, try again after a delay
        setTimeout(checkAndHide, 200);
        setTimeout(checkAndHide, 500);
        setTimeout(checkAndHide, 1000);
      }
    };
    
    hideOutputField();
    
    // Also hide on resize
    window.addEventListener('resize', hideOutputField);
    
    return () => {
      window.removeEventListener('resize', hideOutputField);
    };
  }, []);

  // Setup MutationObserver for text replacement, conversions, and div removal
  useEffect(() => {
    let observer: MutationObserver | null = null;

    const updateBuyTextAndHideReceive = () => {
      // Replace "Buy" with "Receive" and hide Receive section
      const textElements = document.querySelectorAll('.relay-text_text-subtle.relay-font_body.relay-fw_500.relay-fs_14px');
      textElements.forEach(element => {
        if (element.textContent === 'Buy') {
          element.textContent = 'Receive';
        }
        if (element.textContent === 'Receive') {
          const receiveSection = element.closest('.relay-d_flex.relay-items_center.relay-justify_space-between.relay-w_100\\%');
          if (receiveSection) {
            (receiveSection as HTMLElement).style.display = 'none';
          }
        }
      });

      // Handle token display and conversion
      const tokenDisplayDivs = document.querySelectorAll('.relay-d_flex.relay-bg_gray2.relay-px_3.relay-py_2.relay-gap_2.relay-rounded_25.relay-text_gray8.relay-items_center');
      tokenDisplayDivs.forEach((div, index) => {
        const imgElements = div.querySelectorAll('img');
        const amountElement = div.querySelector('.relay-text_text-default.relay-font_body.relay-fw_500.relay-fs_16px');
        
        if (!amountElement) return;

        const isUSDC = imgElements[0]?.src.includes('usdc.png');
        const isBase = imgElements[1]?.src.includes('8453');
        
        // If this is USDC on Base chain
        if (isUSDC && isBase) {
          const amount = parseFloat(amountElement.textContent?.replace(/,/g, '') || '0');
          
          // For the second div (output/receive side), convert to Naira and show Naira flag
          if (index === 1) {
            const ngnAmount = amount * paycrestRate;
            amountElement.textContent = ngnAmount.toLocaleString('en-NG', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });
            
            // Change only the token logo to Naira flag
            if (imgElements[0]) {
              imgElements[0].src = 'https://crossbow.noblocks.xyz/_next/image?url=https%3A%2F%2Fflagcdn.com%2Fh24%2Fng.webp&w=48&q=75';
            }
          }
        }
      });

      // Update ZK to NGN for specific div
      const zkDivs = document.querySelectorAll('.relay-text_text-default.relay-font_body.relay-fw_500.relay-fs_14px');
      zkDivs.forEach(div => {
        const text = div.textContent || '';
        if (text.includes('1 ZK =')) {
          const match = text.match(/1 ZK = ([\d.]+)\s*/);
          if (match && match[1]) {
            const zkValue = parseFloat(match[1]);
            if (!isNaN(zkValue)) {
              const ngnValue = zkValue * paycrestRate;
              const formattedNgn = ngnValue.toLocaleString('en-NG', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
              div.textContent = `1 ZK = ${formattedNgn}`;
            }
          }
        }
      });

      // Remove the specified div to eliminate its space
      const divsToRemove = document.querySelectorAll('.relay-d_flex.relay-items_center.relay-justify_space-between.relay-gap_3.relay-w_100\\%.__web-inspector-hide-shortcut__');
      divsToRemove.forEach(div => {
        div.remove();
      });
    };

    const timer = setTimeout(() => {
      updateBuyTextAndHideReceive();
      
      observer = new MutationObserver(() => {
        updateBuyTextAndHideReceive();
      });

      observer.observe(document.body, { childList: true, subtree: true });

      window.addEventListener('unload', () => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
      });
    }, 500);

    return () => {
      clearTimeout(timer);
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };
  }, [paycrestRate]);

  // Initialize last order time in state
  useEffect(() => {
    // Check for stored timestamp
    const storedTimestamp = localStorage.getItem('lastOrderTimestamp')
    if (storedTimestamp) {
      setLastOrderTime(parseInt(storedTimestamp))
    }
  }, [])

  // Add new interfaces for Paycrest responses
  interface PaycrestOrderResponse {
    message: string;
    status: string;
    data: {
      id: string;
      amount: string;
      token: string;
      network: string;
      receiveAddress: string;
      validUntil: string;
      senderFee: string;
      transactionFee: string;
      reference: string;
    }
  }

  interface PaycrestOrderStatusResponse {
    message: string;
    status: string;
    data: {
      id: string;
      amount: string;
      amountPaid: string;
      amountReturned: string;
      token: string;
      senderFee: string;
      transactionFee: string;
      rate: string;
      network: string;
      gatewayId: string;
      reference: string;
      recipient: {
        institution: string;
        accountIdentifier: string;
        accountName: string;
        memo: string;
      };
      fromAddress: string;
      returnAddress: string;
      receiveAddress: string;
      feeAddress: string;
      createdAt: string;
      updatedAt: string;
      txHash: string;
      status: 'initiated' | 'settled' | 'refunded' | 'expired';
      transactions: Array<{
        id: string;
        gatewayId: string;
        status: string;
        txHash: string;
        createdAt: string;
      }>;
    }
  }

  // Function to check Paycrest order status
  async function checkOrderStatus(orderId: string): Promise<OrderStatus> {
    try {
      console.log(`[checkOrderStatus] Checking status for order ID: ${orderId}`)
      
      const response = await fetch(`/api/check-order-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId })
      })
      
      if (!response.ok) {
        console.error(`[checkOrderStatus] Failed to fetch order status. Status: ${response.status}`)
        const errorText = await response.text()
        console.error('[checkOrderStatus] Error response:', errorText)
        // Return expired on API errors to trigger new order creation
        return 'expired'
      }
      
      const data = await response.json()
      
      if (data.status === 'success' && data.data) {
        const orderStatus = data.data.status as OrderStatus
        console.log(`[checkOrderStatus] Order ${orderId} status:`, orderStatus, data.data)
        
        // Update local storage with latest status
        localStorage.setItem('paycrestOrderStatus', orderStatus)
        
        // Clear order data if expired
        if (orderStatus === 'expired') {
          console.log('[checkOrderStatus] Order expired, clearing local storage')
          localStorage.removeItem('paycrestOrderId')
          localStorage.removeItem('paycrestReceiveAddress')
          localStorage.removeItem('paycrestReference')
          localStorage.removeItem('paycrestValidUntil')
          localStorage.removeItem('lastOrderTimestamp')
        }
        
        return orderStatus
      }
      
      console.warn(`[checkOrderStatus] Invalid response:`, data)
      // Return expired on invalid response to trigger new order creation
      return 'expired'
    } catch (error) {
      console.error(`[checkOrderStatus] Error:`, error)
      // Return expired on errors to trigger new order creation
      return 'expired'
    }
  }

  // Update createNewOrder function to use new API key
  const createNewOrder = async (forceCreate = false) => {
    try {
      // Get bank details from localStorage
      const storedBank = localStorage.getItem('linkedBankAccount')
      if (!storedBank) {
        console.error('[createNewOrder] No bank details found, cannot create order')
        return null
      }
      
      const bankDetails = JSON.parse(storedBank)
      console.log('[createNewOrder] Bank details from localStorage:', bankDetails)
      
      // Diagnostic log for wallet state
      console.log('[createNewOrder] walletType:', walletType, 'adaptedWallet:', adaptedWallet)
      
      // Skip wallet checks if we're forcing order creation
      if (!forceCreate) {
        // For EVM, require adaptedWallet.address
        if (walletType === 'evm' && (!adaptedWallet || !adaptedWallet.address)) {
          console.error('[createNewOrder] EVM wallet not ready or address missing, skipping order creation');
          return null;
        }
        // For Solana, just require walletType === 'svm' and authenticated
        if (walletType === 'svm' && !authenticated) {
          console.error('[createNewOrder] Solana wallet not authenticated, skipping order creation');
          return null;
        }
      }
      
      // Get current time and check if we need a new order
      const now = Date.now()
      const lastOrderTime = parseInt(localStorage.getItem('lastOrderTimestamp') || '0')
      
      // Only check for existing order if not forced to create a new one
      if (!forceCreate) {
        // If it hasn't been 1 minute since the last order was created
        if (now - lastOrderTime < ORDER_REFRESH_INTERVAL) {
          // Check if we already have a valid order
          const storedAddress = localStorage.getItem('paycrestReceiveAddress')
          const storedOrderId = localStorage.getItem('paycrestOrderId')
          
          if (storedAddress && storedOrderId) {
            console.log('[createNewOrder] Using existing valid order:', storedOrderId)
            setDestinationAddress(storedAddress)
            return storedAddress
          }
        }
      }
      
      // If we reach here, either forceCreate is true or we need a new order
      console.log('[createNewOrder] Creating new Paycrest order', forceCreate ? '(forced)' : '')
      
      try {
        console.log('[createNewOrder] Fetching account details and rate...')
        const [accountNameResponse, nairaRateResponse] = await Promise.all([
          fetch('/api/verify-account', {
            method: "POST",
            headers: { 
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              institution: bankDetails.code || bankDetails.institution,
              accountIdentifier: bankDetails.accountIdentifier
            })
          }),
          fetch('/api/get-rate', {
            headers: { 
              "Content-Type": "application/json"
            }
          })
        ])

        // Log responses
        console.log('[createNewOrder] Account verification response:', {
          status: accountNameResponse.status,
          ok: accountNameResponse.ok
        })
        console.log('[createNewOrder] Rate response:', {
          status: nairaRateResponse.status,
          ok: nairaRateResponse.ok
        })
        
        if (!accountNameResponse.ok || !nairaRateResponse.ok) {
          const accountError = await accountNameResponse.text().catch(() => 'Failed to get error text')
          const rateError = await nairaRateResponse.text().catch(() => 'Failed to get error text')
          console.error('[createNewOrder] API responses failed:', {
            accountError,
            rateError
          })
          throw new Error("Failed to fetch account details or rate")
        }
        
        const accountData = await accountNameResponse.json()
        const rateData = await nairaRateResponse.json()
        
        console.log('[createNewOrder] Account data:', accountData)
        console.log('[createNewOrder] Rate data:', rateData)
        
        if (!accountData.data || !rateData.data) {
          console.error('[createNewOrder] Invalid response from API:', {
            accountData,
            rateData
          })
          return null
        }
        
        const accountName = accountData.data?.accountName || bankDetails.accountName || "Unknown Account"
        const rate = rateData.data || DEFAULT_RATE
        
        // Create order with the required payload format
        const orderPayload = {
          amount: 0.5, // Minimum amount for order creation
          token: "USDC",
          rate: rate,
          network: "base", // Using base network for USDC
          recipient: {
            institution: bankDetails.code || bankDetails.institution,
            accountIdentifier: bankDetails.accountIdentifier,
            accountName: accountName,
            memo: "Payment via DirectPay"
          },
          returnAddress: walletType === 'evm' && connectedAddress ? connectedAddress : DEFAULT_DESTINATION_ADDRESS,
          reference: `directpay-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        }
        
        console.log('[createNewOrder] Sending order payload:', orderPayload)
        
        const orderResponse = await fetch('/api/create-order', {
          method: "POST",
          headers: { 
            "Content-Type": "application/json"
          },
          body: JSON.stringify(orderPayload)
        })

        // Log the raw response
        console.log('[createNewOrder] Order response status:', orderResponse.status);
        const responseText = await orderResponse.text();
        console.log('[createNewOrder] Order response text:', responseText);
        
        if (!orderResponse.ok) {
          console.error('[createNewOrder] Failed to create order:', {
            status: orderResponse.status,
            response: responseText
          });
          return null;
        }
        
        const orderData: PaycrestOrderResponse = JSON.parse(responseText);
        console.log('[createNewOrder] Parsed order response:', orderData);
        
        if (!orderData.data) {
          console.error('[createNewOrder] Order creation failed:', orderData.message || 'Unknown error')
          return null
        }
        
        // Store comprehensive order details for later use
        const lastOrderDetails = {
          ...orderData.data,
          orderPayload: orderPayload
        };
        localStorage.setItem('paycrestLastOrder', JSON.stringify(lastOrderDetails));
        
        // Store order details including ID
        if (orderData.data.id) {
          localStorage.setItem('paycrestOrderId', orderData.data.id);
          
          // Store and use the receive address from the order
          if (orderData.data.receiveAddress) {
            console.log('[createNewOrder] Setting receive address:', orderData.data.receiveAddress);
            localStorage.setItem('paycrestReceiveAddress', orderData.data.receiveAddress);
            setDestinationAddress(orderData.data.receiveAddress);
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'paycrestReceiveAddress',
              newValue: orderData.data.receiveAddress
            }));
          } else {
            console.error('[createNewOrder] API response missing receive address!');
            return null;
          }
        } else {
          console.error('[createNewOrder] API response missing order ID!');
          return null;
        }
        
        localStorage.setItem('paycrestReference', orderData.data.reference)
        localStorage.setItem('paycrestValidUntil', orderData.data.validUntil)
        localStorage.setItem('lastOrderTimestamp', now.toString())
        
        // Check order status immediately
        const status = await checkOrderStatus(orderData.data.id)
        
        // Only use the address if status is initiated
        if (status === 'initiated') {
          lastValidOrderRef.current = {
            address: orderData.data.receiveAddress,
            timestamp: now
          }
          setOrderStatus('valid')
          console.log('[createNewOrder] New order created and valid:', orderData.data.id)
          return orderData.data.receiveAddress
        } else {
          console.warn('[createNewOrder] Order status not initiated:', status)
          // Force create a new order since this one is not usable
          return createNewOrder(true)
        }
        return null
      } catch (error) {
        console.error('[createNewOrder] API request failed:', error)
        return null
      }
    } catch (error) {
      console.error('[createNewOrder] Error creating order:', error)
      return null
    }
  }

  // Add bank account change handler
  const handleBankAccountChange = useCallback(async (newBankDetails: any) => {
    console.log('Bank account changed, creating new order')
    try {
      await createNewOrder(true)
    } catch (error) {
      console.error('Failed to create new order after bank change:', error)
    }
  }, [])

  // Update the periodic order check
  useEffect(() => {
    let isCreatingOrder = false
    
    const checkAndUpdateOrder = async () => {
      if (isCreatingOrder) {
        console.log('[checkAndUpdateOrder] Order creation already in progress, skipping check')
        return
      }

      const storedOrderId = localStorage.getItem('paycrestOrderId')
      const storedStatus = localStorage.getItem('paycrestOrderStatus')
      
      // Skip check if we already know the order is expired
      if (storedStatus === 'expired') {
        console.log('[checkAndUpdateOrder] Order already marked as expired, creating new order')
        try {
          isCreatingOrder = true
          await createNewOrder(true)
        } catch (err) {
          console.error('[checkAndUpdateOrder] Error creating new order:', err)
        } finally {
          isCreatingOrder = false
        }
        return
      }
      
      if (storedOrderId) {
        try {
          isCreatingOrder = true
          const status = await checkOrderStatus(storedOrderId)
          
          // Create new order if expired
          if (status === 'expired') {
            console.log(`[checkAndUpdateOrder] Order ${storedOrderId} expired, creating new order`)
            await createNewOrder(true)
          }
        } catch (err) {
          console.error('[checkAndUpdateOrder] Error in order check cycle:', err)
        } finally {
          isCreatingOrder = false
        }
      } else {
        // No order ID exists, create first order
        try {
          isCreatingOrder = true
          console.log('[checkAndUpdateOrder] No existing order, creating first order')
          await createNewOrder(true)
        } catch (err) {
          console.error('[checkAndUpdateOrder] Error creating first order:', err)
        } finally {
          isCreatingOrder = false
        }
      }
    }

    // Run check immediately
    checkAndUpdateOrder()

    // Set up interval to check periodically
    const interval = setInterval(checkAndUpdateOrder, ORDER_CHECK_INTERVAL)
    
    return () => clearInterval(interval)
  }, [lastOrderTime])

  // Add this effect to handle wallet balance display
  useEffect(() => {
    if (adaptedWallet && walletType) {
      // Force a refresh of the wallet balance display
      const refreshBalance = () => {
        const balanceElements = document.querySelectorAll('.relay-text_text-default.relay-font_body.relay-fw_500.relay-fs_14px');
        balanceElements.forEach(element => {
          if (element.textContent?.includes('Balance:')) {
            // Trigger a re-render by updating the element
            element.setAttribute('data-balance-updated', Date.now().toString());
          }
        });
      };

      // Initial refresh
      refreshBalance();

      // Set up periodic refresh
      const interval = setInterval(refreshBalance, 2000);
    return () => clearInterval(interval);
    }
  }, [adaptedWallet, walletType]);

  return (
    <div className="relative">
      <div className="swap-page-center">
        <div className="swap-card" ref={containerRef}>
          {error ? (
            <div className="p-4 bg-red-50 border-b border-red-200 text-red-700">
              <p>Error: {error}</p>
              <button className="mt-2 px-4 py-2 bg-red-600 text-white rounded" onClick={() => window.location.reload()}>Reload</button>
            </div>
          ) : (
            <RelayKitProvider 
              options={{
                appName: 'DirectPay',
                baseApiUrl: MAINNET_RELAY_API,
                duneConfig: {
                  apiKey: "SWDwVHIY3Y8S4rWu8XIPV6CcHI1q4hh5"
                },
                disablePoweredByReservoir: true,
                chains: chains.length > 0 ? chains : [convertViemChainToRelayChain(mainnet)],
              }}
            >
              {isChainsLoading ? (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(0, 0, 0, 0.5)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  zIndex: 1000
                }}>
                  Loading chains...
                </div>
              ) : null}
              
              {/* Add SlippageToleranceConfig at the top */}
              <div style={{
                position: 'absolute',
                top: '-28px',
                right: '20px',
                zIndex: 10
              }}>
                <SlippageToleranceConfig
                  setSlippageTolerance={setSlippageTolerance}
                  onAnalyticEvent={(eventName, data) => {
                    console.log('Slippage Config Event:', eventName, data);
                  }}
                />
              </div>
              
              <SwapWidget
                fromToken={fromToken}
                setFromToken={(token) => token && setFromTokenState(token)}
                toToken={toToken}
                setToToken={(token) => token && setToTokenState(token)}
                lockFromToken={false}
                lockToToken={true}
                supportedWalletVMs={['evm', 'svm']}
                onConnectWallet={handleWalletConnection}
                defaultToAddress={destinationAddress as `0x${string}`}
                multiWalletSupportEnabled={true}
                onSetPrimaryWallet={() => {}}
                onLinkNewWallet={() => {}}
                linkedWallets={[]}
                wallet={adaptedWallet}
                onAnalyticEvent={handleAnalyticEvent}
                slippageTolerance={slippageTolerance}
                onSwapSuccess={handleSwapSuccess}
              />
              
              {/* Responsive overlay for Naira amount - hide when transaction popup is showing */}
              {!showTransactionStatus && (
                <div
                  ref={overlayRef}
                  className="responsive-overlay"
                  style={{
                    position: 'absolute',
                    top: '210px',
                    left: '140px',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'transparent',
                    color: 'black',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '2.0rem',
                    zIndex: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    width: '250px',
                    height: '50px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    maxWidth: 'calc(100% - 40px)',
                    pointerEvents: 'none'
                  }}
                >
                  {isLoading || isRateLoading ? (
                    <div style={{
                      width: '120px',
                      height: '24px',
                      background: 'linear-gradient(90deg,rgba(206,206,206,0.7) 25%,rgba(194,195,198,0.7) 50%,rgba(156,156,157,0.7) 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'pulse 1.5s infinite linear',
                      borderRadius: '4px'
                    }} />
                  ) : (
                    <>
                      <span style={{ 
                        fontSize: nairaAmount.length > 8 ? (nairaAmount.length > 12 ? '1.5rem' : '1.6rem') : '2.0rem',
                        transition: 'font-size 0.1s ease',
                        textAlign: 'left',
                        display: 'inline-block',
                        minWidth: '240px',
                        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {nairaAmount}
                      </span>
                    </>
                  )}
                </div>
              )}
            </RelayKitProvider>
          )}
        </div>
        
        {/* Transaction Status Popup */}
        {currentTransaction && (
          <TransactionStatusPopup
            isOpen={showTransactionStatus}
            onClose={() => {
              setShowTransactionStatus(false);
              setCurrentTransaction(null);
            }}
            orderId={currentTransaction.orderId}
            originToken={currentTransaction.originToken}
            usdcAmount={currentTransaction.usdcAmount}
            nairaAmount={currentTransaction.nairaAmount}
            bankDetails={currentTransaction.bankDetails}
          />
        )}
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') {
  const styleId = 'swap-widget-wrapper-styles';
  if (!document.getElementById(styleId)) {
    // Add viewport meta tag if it doesn't exist
    if (!document.querySelector('meta[name="viewport"]')) {
      const viewport = document.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
      document.head.appendChild(viewport);
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      body { 
        background: #f9fafb !important; 
        min-height: 100vh; 
        margin: 0; 
        padding: 0;
        font-family: 'Inter', system-ui, -apple-system, sans-serif; 
        overflow-x: hidden;
      }
      
      .swap-page-center { 
        display: flex; 
        align-items: center; 
        justify-content: center; 
        padding: 0.5rem;
        width: 100%;
      }
      
      .swap-card { 
        background: transparent; 
        border-radius: 16px; 
        box-shadow: none;
        padding: 24px 20px; 
        width: 100%; 
        margin: 0 auto; 
        position: relative;
        border: none;
      }
      
      @keyframes pulse { 0% { background-position: 0% 0; } 100% { background-position: -200% 0; } }
      
      .relay-kit { 
        background: transparent !important; 
        border: none !important; 
        box-shadow: none !important; 
      }
      
      .relay-kit .relay-header, .relay-kit .relay-footer { 
        display: none !important; 
      }
      
      /* Naira logo replacement */
      .relay-d_flex.relay-bg_gray2.relay-px_3.relay-py_2.relay-gap_2.relay-rounded_25.relay-text_gray8.relay-items_center img[src*="usdc.png"] {
        content: url('https://crossbow.noblocks.xyz/_next/image?url=https%3A%2F%2Fflagcdn.com%2Fh24%2Fng.webp&w=48&q=75') !important;
      }

      /* Enhanced responsive styles */
      .relay-d_flex.relay-bg_gray2.relay-px_3.relay-py_2.relay-gap_2.relay-rounded_25.relay-text_gray8.relay-items_center .relay-d_flex.relay-shrink_0.relay-pos_absolute.relay-right_0.relay-bottom_0.relay-rounded_4.relay-overflow_hidden {
        display: none !important;
      }

      /* Hide multi-wallet dropdown button in Receive section */
      #to-token-section .relay-cursor_pointer.relay-ring_none.relay-font_body.relay-fw_700.relay-fs_16.relay-transition_background-color_250ms_linear {
        display: none !important;
      }

      /* Hide USD price and percentage section */
      #to-token-section .relay-d_flex.relay-items_center.relay-justify_space-between.relay-gap_3.relay-w_100\\% .relay-d_flex.relay-items_center.relay-gap_1.relay-min-h_18 {
        display: none !important;
      }

      /* Adjust to-token-section spacing */
      #to-token-section .relay-d_flex.relay-items_center.relay-justify_space-between.relay-gap_4.relay-w_100\\% {
        position: relative;
        top: 15px;
      }

      /* Responsive button styling */
      .relay-button {
        border-radius: 12px !important;
        font-weight: 600 !important;
        letter-spacing: 0.01em !important;
      }

      /* Responsive input styling */
      .relay-input {
        border-radius: 12px !important;
      }

      /* Hide specified selector */
      #to-token-section > div.relay-d_flex.relay-items_center.relay-justify_space-between.relay-gap_3.relay-w_100\\% > div.relay-d_flex.relay-ml_auto > div > div {
        display: none !important;
      }
      
      /* Responsive adjustments for overlay */
      @media (max-width: 480px) {
        .swap-card {
          padding: 20px 16px;
          border-radius: 12px;
          font-size: 16px !important;
        }
        
        /* Force font size to prevent zoom */
        .relay-kit input,
        .relay-kit select,
        .relay-kit textarea {
          font-size: 16px !important;
        }

        /* Adjust input padding and height */
        .relay-kit input {
          padding: 8px 12px !important;
          height: 40px !important;
        }
        
        .responsive-overlay {
          width: 220px !important;
          left: 130px !important;
          top: 205px !important;
        }
      }
      
      @media (max-width: 374px) {
        .swap-card {
          padding: 16px 12px;
        }
        
        .responsive-overlay {
          width: 200px !important;
          left: 130px !important;
          top: 205px !important;
        }
        
        .responsive-overlay span {
          font-size: 1.4rem !important;
          min-width: 200px !important;
        }
      }
      
      /* Portrait phone styles */
      @media (max-height: 750px) and (max-width: 450px) {
      }
      
      /* Small portrait phone styles */
      @media (max-height: 650px) and (max-width: 400px) {
      }

      /* Ensure swap button and other elements are properly spaced */
      .relay-button {
        position: relative;
        z-index: 2;
        margin-bottom: 8px;
      }

      /* Add spacing after the wallet connection area */
      .relay-d_flex.relay-items_center.relay-justify_space-between.relay-gap_3.relay-w_100\% {
        margin-bottom: 16px;
      }

      /* Ensure proper spacing in the swap card */
      .swap-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Hide NGN text in rate display */
      .relay-text_text-default.relay-font_body.relay-fw_500.relay-fs_14px:not([data-rate-processed]) {
        opacity: 1;
      }
      .relay-text_text-default.relay-font_body.relay-fw_500.relay-fs_14px[data-rate-processed] {
        opacity: 1;
        transition: opacity 0.2s ease;
      }

      /* Improve wallet connection visibility */
      .relay-wallet-button {
        background: rgba(255,255,255,0.1) !important;
        border: 1px solid rgba(255,255,255,0.2) !important;
        transition: all 0.2s ease !important;
      }
      
      .relay-wallet-button:hover {
        background: rgba(255,255,255,0.15) !important;
        border-color: rgba(255,255,255,0.3) !important;
      }
      
      /* Enhance Solana wallet buttons */
      .relay-wallet-option[data-wallet-type*="solana"],
      .relay-wallet-option[data-wallet-type*="phantom"],
      .relay-wallet-option[data-wallet-type*="solflare"] {
        background: linear-gradient(45deg, #9945FF, #14F195) !important;
        border: none !important;
      }
      
      /* Fix text color in the swap details section */
      .relay-kit .relay-text_text-subtle,
      .relay-kit .relay-text_text-default {
        color: #000 !important; /* Set text color to black */
      }

      /* Style the slippage config button */
      .relay-slippage-button {
        background: rgba(255,255,255,0.1) !important;
        border: 1px solid rgba(255,255,255,0.2) !important;
        border-radius: 8px !important;
        padding: 6px 12px !important;
        color: rgba(255,255,255,0.8) !important;
        font-size: 14px !important;
        transition: all 0.2s ease !important;
      }

      .relay-slippage-button:hover {
        background: rgba(255,255,255,0.15) !important;
        border-color: rgba(255,255,255,0.3) !important;
      }

      /* Position slippage config properly */
      .relay-slippage-config {
        position: absolute !important;
        top: auto !important;
        bottom: calc(100% + 8px) !important;
        right: 8px !important;
        background: #2A2D36 !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        border-radius: 12px !important;
        padding: 12px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
        z-index: 100 !important;
      }

      /* Transaction Status Styles */
      .transaction-status-pill {
        background: white;
        border-radius: 9999px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        transition: all 0.2s ease;
      }

      .transaction-status-pill:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .status-dot.processing {
        background: #3b82f6;
        animation: pulse 2s infinite;
      }

      .status-dot.success {
        background: #10b981;
      }

      .status-dot.error {
        background: #ef4444;
      }

      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }

      /* Transaction Details Panel */
      .transaction-details {
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        transition: all 0.2s ease;
      }

      .transaction-details-header {
        border-bottom: 1px solid #f3f4f6;
        padding-bottom: 12px;
        margin-bottom: 12px;
      }

      /* Responsive styles for transaction status */
      @media (max-width: 640px) {
        .transaction-status-pill {
          font-size: 0.875rem;
          padding: 0.5rem 1rem;
        }

        .transaction-details {
          width: calc(100vw - 32px);
          margin: 0 16px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}