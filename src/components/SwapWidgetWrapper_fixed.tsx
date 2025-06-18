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

// Define OrderStatus type
type OrderStatus = 'initiated' | 'settled' | 'refunded' | 'expired';
type OrderStateStatus = OrderStatus | 'valid' | 'expired' | 'none' | null;

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
const ORDER_REFRESH_INTERVAL = 1 * 60 * 1000 // 1 minute in milliseconds (for testing)
const ORDER_CHECK_INTERVAL = 10 * 1000 // 10 seconds in milliseconds (for faster testing)

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
  onBankAccountChange?: (bankDetails: any) => void;
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
        // Check for EVM wallet
        if (walletClient) {
      // TODO: Using type assertion due to complex type mismatch between Viem's WalletClient
      // and Reservoir SDK's expected input type. This should be revisited when the SDK
      // provides better TypeScript type definitions.
      const evmWallet = adaptViemWallet(walletClient as any);
      setAdaptedWallet(evmWallet);
          setWalletType('evm');
      console.log("EVM wallet adapted:", evmWallet);
          return;
        }
    
    // Enhanced logging for wallet detection
    console.log("Checking for wallets in Privy user:", {
      linkedAccounts: user.linkedAccounts,
      wallet: user.wallet
    });
        
        // Check for Solana wallet in user's linked wallets from Privy
    const linkedAccounts = (user.linkedAccounts || []) as PrivyWalletAccount[];
    console.log("All linked accounts:", linkedAccounts);

    const solanaWallet = linkedAccounts.find(account => {
      console.log("Checking account:", account);
      const isSolana = account.type === 'wallet' && 
                      (account.walletClientType?.toLowerCase().includes('solana') ||
                       account.walletClientType?.toLowerCase().includes('phantom') ||
                       account.walletClientType?.toLowerCase().includes('solflare'));
      
      if (isSolana) {
        console.log("Found Solana wallet in linked accounts:", account);
      }
      return isSolana;
          });
          
          if (solanaWallet) {
      console.log("Initializing Solana wallet:", solanaWallet);
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
        
        // Use the direct approach with Privy's API to get the wallet client
        const solanaAdaptedWallet = await adaptSolanaWallet({
          publicKey: solanaWallet.address,
          signTransaction: async (transaction) => {
            console.log("Signing Solana transaction through Privy");
            
            // First try browser wallet extensions directly
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
            
            // If browser wallets failed, log the error
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

export default function SwapWidgetWrapper({ onSwapSuccess, onBankAccountChange }: SwapWidgetWrapperProps) {
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
  
  // Enhanced order state management
  const [orderState, setOrderState] = useState<{
    id: string | null;
    receiveAddress: string | null;
    status: OrderStateStatus;
    validUntil: string | null;
    reference: string | null;
    lastUpdated: number;
    isLoading: boolean;
    error: string | null;
  }>({
    id: localStorage.getItem('paycrestOrderId'),
    receiveAddress: localStorage.getItem('paycrestReceiveAddress'),
    status: null,
    validUntil: localStorage.getItem('paycrestValidUntil') || null,
    reference: localStorage.getItem('paycrestReference') || null,
    lastUpdated: parseInt(localStorage.getItem('lastOrderTimestamp') || '0'),
    isLoading: false,
    error: null
  });
  
  // Helper function to update order state and localStorage
  const updateOrderState = useCallback((updates: Partial<typeof orderState>) => {
    setOrderState(prev => {
      const newState = { ...prev, ...updates };
      
      // Update localStorage for persistent values
      if (updates.id !== undefined) {
        if (updates.id) localStorage.setItem('paycrestOrderId', updates.id);
        else localStorage.removeItem('paycrestOrderId');
      }
      
      if (updates.receiveAddress !== undefined) {
        if (updates.receiveAddress) localStorage.setItem('paycrestReceiveAddress', updates.receiveAddress);
        else localStorage.removeItem('paycrestReceiveAddress');
      }
      
      if (updates.validUntil !== undefined) {
        if (updates.validUntil) localStorage.setItem('paycrestValidUntil', updates.validUntil);
        else localStorage.removeItem('paycrestValidUntil');
      }
      
      if (updates.reference !== undefined) {
        if (updates.reference) localStorage.setItem('paycrestReference', updates.reference);
        else localStorage.removeItem('paycrestReference');
      }
      
      if (updates.lastUpdated !== undefined) {
        localStorage.setItem('lastOrderTimestamp', updates.lastUpdated.toString());
      }
      
      return newState;
    });
  }, []);
  
  // Clear order state helper
  const clearOrderState = useCallback(() => {
    updateOrderState({
      id: null,
      receiveAddress: null,
      status: null,
      validUntil: null,
      reference: null,
      lastUpdated: Date.now(),
      error: null
    });
  }, [updateOrderState]);
  
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
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null)
  const rateRef = useRef(DEFAULT_RATE)
  const [lastOrderTime, setLastOrderTime] = useState<number>(0)
  const { address: connectedAddress } = useAccount()
  const [orderStatus, setOrderStatus] = useState<'valid' | 'expired' | 'none'>('none')
  const lastValidOrderRef = useRef<{ address: string; timestamp: number } | null>(null)
  const [swapSuccessOccurred, setSwapSuccessOccurred] = useState(false)
  const [slippageTolerance, setSlippageTolerance] = useState<string | undefined>(undefined)
  const [showSlippageConfig, setShowSlippageConfig] = useState(false)
  
  // Add new state for transaction tracking
  const [transactionHistory, setTransactionHistory] = useState<TransactionStatus[]>([]);
  const [showTransactionStatus, setShowTransactionStatus] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<TransactionStatus | null>(null);
  
  // Define functions early to avoid reference errors
  // Improved order status check function
  const checkOrderStatus = useCallback(async (orderId: string): Promise<OrderStatus> => {
    if (!orderId) {
      console.error('[checkOrderStatus] No order ID provided');
      return 'expired';
    }
    
    try {
      console.log(`[checkOrderStatus] Checking status for order ID: ${orderId}`);
      
      const response = await fetch(`https://api.paycrest.io/v1/sender/orders/${orderId}`, {
        headers: {
          'API-Key': '7f7d8575-be32-4598-b6a2-43801fe173dc',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[checkOrderStatus] Failed to fetch order status: ${response.status} - ${errorText}`);
        return 'expired';
      }
      
      const data: PaycrestOrderStatusResponse = await response.json();
      
      if (data.status === 'success' && data.data) {
        const orderStatus = data.data.status as OrderStatus;
        console.log(`[checkOrderStatus] Order ${orderId} status: ${orderStatus}`, data.data);
        
        // Update order state with latest status
        if (orderState.id === orderId) {
          updateOrderState({ 
            status: orderStatus,
            // If the order is expired, clear the receive address to force new order creation
            receiveAddress: orderStatus === 'expired' ? null : orderState.receiveAddress
          });
          
          // Update UI order status
          if (orderStatus === 'initiated') {
            setOrderStatus('valid');
          } else if (orderStatus === 'expired') {
            setOrderStatus('expired');
          }
        }
        
        return orderStatus;
      }
      
      console.warn(`[checkOrderStatus] Invalid response for order ${orderId}:`, data);
      return 'expired';
    } catch (error) {
      console.error(`[checkOrderStatus] Error checking order ${orderId}:`, error);
      return 'expired';
    }
  }, [orderState.id, updateOrderState]);

  // Function to verify if a receive address is valid
  const verifyReceiveAddress = useCallback(async (address: string): Promise<boolean> => {
    if (!address) {
      console.log('[verifyReceiveAddress] No address provided, cannot verify');
      setVerifiedAddress(null);
      return false;
    }
    
    if (!orderState.id) {
      console.log('[verifyReceiveAddress] No order ID available, cannot verify address');
      setVerifiedAddress(null);
      return false;
    }
    
    try {
      console.log(`[verifyReceiveAddress] Checking if address ${address} is valid for order ${orderState.id}`);
      setIsLoading(true);
      
      const orderStatus = await checkOrderStatus(orderState.id);
      const isValid = orderStatus === 'initiated';
      
      console.log(`[verifyReceiveAddress] Address validity check result: ${isValid ? 'valid' : 'invalid'}`);
      
      // Update verified address state
      if (isValid) {
        setVerifiedAddress(address);
      } else {
        setVerifiedAddress(null);
      }
      
      return isValid;
    } catch (error) {
      console.error('[verifyReceiveAddress] Error verifying address:', error);
      setVerifiedAddress(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [orderState.id, checkOrderStatus, setIsLoading]);

  // Completely rewritten createNewOrder function
  const createNewOrder = useCallback(async (forceCreate = false): Promise<string | null> => {
    // Don't create a new order if one is already loading
    if (orderState.isLoading && !forceCreate) {
      console.log('[createNewOrder] Order creation already in progress, skipping');
      return null;
    }
    
    try {
      // Update loading state
      updateOrderState({ isLoading: true, error: null });
      
      // Check for bank details first
      const storedBank = localStorage.getItem('linkedBankAccount');
      if (!storedBank) {
        console.error('[createNewOrder] No bank details found, cannot create order');
        updateOrderState({ 
          isLoading: false, 
          error: 'No bank account linked. Please link a bank account first.' 
        });
        return null;
      }
      
      const bankDetails = JSON.parse(storedBank);
      
      // Check if we have a valid existing order (unless forceCreate is true)
      if (!forceCreate) {
        const now = Date.now();
        const validUntil = orderState.validUntil ? new Date(orderState.validUntil).getTime() : 0;
        
        // If we have a valid order that hasn't expired yet
        if (
          orderState.id && 
          orderState.receiveAddress && 
          validUntil > now && 
          now - orderState.lastUpdated < ORDER_REFRESH_INTERVAL
        ) {
          console.log(`[createNewOrder] Using existing valid order: ${orderState.id}, valid until ${new Date(validUntil).toLocaleTimeString()}`);
          updateOrderState({ isLoading: false });
          return orderState.receiveAddress;
        }
      }
      
      // Check wallet readiness
      console.log('[createNewOrder] Checking wallet state:', { 
        authenticated, 
        walletType, 
        hasWallet: !!adaptedWallet,
        walletAddress: adaptedWallet?.address || connectedAddress 
      });
      
      // For EVM wallets, we need an address
      if (walletType === 'evm' && (!adaptedWallet || !adaptedWallet.address)) {
        console.error('[createNewOrder] EVM wallet not ready or address missing');
        updateOrderState({ 
          isLoading: false, 
          error: 'EVM wallet not connected or address missing' 
        });
        return null;
      }
      
      // For Solana wallets, we just need authentication
      if (walletType === 'svm' && !authenticated) {
        console.error('[createNewOrder] Solana wallet not authenticated');
        updateOrderState({ 
          isLoading: false, 
          error: 'Solana wallet not authenticated' 
        });
        return null;
      }
      
      console.log('[createNewOrder] Creating new Paycrest order', forceCreate ? '(forced)' : '');
      
      // Step 1: Get account name and rate in parallel
      const verifyAccountEndpoint = "https://api.paycrest.io/v1/verify-account";
      const nairaRateEndpoint = "https://api.paycrest.io/v1/rates/usdc/1/ngn";
      
      try {
        console.log('[createNewOrder] Fetching account details and rate...');
        const [accountNameResponse, nairaRateResponse] = await Promise.all([
          fetch(verifyAccountEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "API-Key": "7f7d8575-be32-4598-b6a2-43801fe173dc"
            },
            body: JSON.stringify({
              institution: bankDetails.institution,
              accountIdentifier: bankDetails.accountIdentifier
            })
          }),
          fetch(nairaRateEndpoint, {
            headers: {
              "API-Key": "7f7d8575-be32-4598-b6a2-43801fe173dc"
            }
          })
        ]);
        
        if (!accountNameResponse.ok || !nairaRateResponse.ok) {
          throw new Error("Failed to fetch account details or rate");
        }
        
        const accountNameData = await accountNameResponse.json();
        const nairaRateData = await nairaRateResponse.json();
        
        console.log('[createNewOrder] Account verification result:', accountNameData);
        console.log('[createNewOrder] Rate data:', nairaRateData);
        
        if (accountNameData.status !== "success" || !accountNameData.data.accountName) {
          throw new Error("Failed to verify account details");
        }
        
        // Step 2: Create the order with Paycrest
        console.log('[createNewOrder] Creating Paycrest order...');
        
        // Determine return address based on wallet type
        let returnAddress = DEFAULT_DESTINATION_ADDRESS;
        if (walletType === 'evm' && adaptedWallet?.address) {
          returnAddress = adaptedWallet.address;
        }
        
        const createOrderEndpoint = "https://api.paycrest.io/v1/sender/orders";
        const orderResponse = await fetch(createOrderEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "API-Key": "7f7d8575-be32-4598-b6a2-43801fe173dc"
          },
          body: JSON.stringify({
            amount: "1", // Minimum amount for quote
            token: "USDC",
            network: "base",
            returnAddress: returnAddress,
            recipient: {
              institution: bankDetails.institution,
              accountIdentifier: bankDetails.accountIdentifier,
              accountName: accountNameData.data.accountName,
              memo: "DirectPay Offramp"
            }
          })
        });
        
        if (!orderResponse.ok) {
          const errorText = await orderResponse.text();
          throw new Error(`Failed to create order: ${errorText}`);
        }
        
        const orderData: PaycrestOrderResponse = await orderResponse.json();
        console.log('[createNewOrder] Order created:', orderData);
        
        if (orderData.status !== "success" || !orderData.data.id) {
          throw new Error("Failed to create order");
        }
        
        // Step 3: Update state with new order details
        const now = Date.now();
        updateOrderState({
          id: orderData.data.id,
          receiveAddress: orderData.data.receiveAddress,
          validUntil: orderData.data.validUntil,
          reference: orderData.data.reference,
          status: 'initiated',
          lastUpdated: now,
          isLoading: false
        });
        
        // Set destination address for the widget
        setDestinationAddress(orderData.data.receiveAddress);
        
        // Update UI order status
        const status = 'initiated';
        if (status === 'initiated') {
          console.log(`[createNewOrder] New order created and valid: ${orderData.data.id}`);
          setVerifiedAddress(orderData.data.receiveAddress);
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'paycrestReceiveAddress',
            newValue: orderData.data.receiveAddress
          }));
          
          setOrderStatus('valid');
          return orderData.data.receiveAddress;
        } else {
          console.error(`[createNewOrder] New order has unexpected status: ${status}`);
          return null;
        }
      } catch (error) {
        console.error('[createNewOrder] Error creating order:', error);
        updateOrderState({ 
          isLoading: false, 
          error: `Failed to create order: ${error instanceof Error ? error.message : String(error)}` 
        });
        return null;
      }
    } catch (error) {
      console.error('[createNewOrder] Unexpected error:', error);
      updateOrderState({ 
        isLoading: false, 
        error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` 
      });
      return null;
    }
  }, [
    orderState.isLoading, 
    orderState.id, 
    orderState.receiveAddress, 
    orderState.validUntil, 
    orderState.lastUpdated, 
    updateOrderState, 
    authenticated, 
    walletType, 
    adaptedWallet, 
    connectedAddress
  ]);
  
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
        
        // If it has a body, enforce our destination address
        if (init && init.body) {
          let body;
          try {
            // Parse the body
            const bodyText = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
            body = JSON.parse(bodyText);
            let modified = false;
            
            // FORCE the recipient in ALL places it could appear
            // Direct recipient field
            if (body.recipient !== destinationAddress) {
              console.warn(`Correcting recipient in API call: ${body.recipient} → ${destinationAddress}`);
              body.recipient = destinationAddress;
              modified = true;
            }
            
            // Check for nested recipient
            if (body.params && body.params.recipient !== destinationAddress) {
              console.warn(`Correcting nested recipient in API call: ${body.params.recipient} → ${destinationAddress}`);
              body.params.recipient = destinationAddress;
              modified = true;
            }
            
            // Check for parameters.recipient
            if (body.parameters && body.parameters.recipient !== destinationAddress) {
              console.warn(`Correcting parameters.recipient in API call: ${body.parameters.recipient} → ${destinationAddress}`);
              body.parameters.recipient = destinationAddress;
              modified = true;
            }
            
            // Check for user field which sometimes doubles as recipient
            if (body.parameters && body.parameters.user && body.parameters.user !== destinationAddress) {
              console.warn(`Correcting parameters.user in API call: ${body.parameters.user} → ${destinationAddress}`);
              body.parameters.user = destinationAddress;
              modified = true;
            }
            
            // Check for returnAddress fields (for Paycrest API)
            if (body.returnAddress) {
              const validReturnAddress = getValidReturnAddress(body.returnAddress);
              if (body.returnAddress !== validReturnAddress) {
                console.warn(`Replacing Solana returnAddress in API call: ${body.returnAddress} → ${validReturnAddress}`);
                body.returnAddress = validReturnAddress;
                modified = true;
              }
            }
            
            // Only replace if modified
            if (modified) {
              init.body = JSON.stringify(body);
            }
          } catch (err) {
            console.error("Error parsing/modifying fetch body:", err);
          }
        }
      }
      
      // Call original fetch with possibly modified arguments
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
      console.log('[destinationAddressEffect] Address updated in component state:', destinationAddress);
      
      // Verify the address is still valid
      (async () => {
        try {
          if (orderState.id && orderState.receiveAddress === destinationAddress) {
            const isValid = await verifyReceiveAddress(destinationAddress);
            
            if (!isValid) {
              console.warn('[destinationAddressEffect] Current address is invalid, creating new order');
              createNewOrder(true).catch(err => {
                console.error('[destinationAddressEffect] Failed to create new order:', err);
              });
            }
          }
        } catch (err) {
          console.error('[destinationAddressEffect] Error verifying destination address:', err);
        }
      })();
    }
  }, [destinationAddress, orderState.id, orderState.receiveAddress, verifyReceiveAddress, createNewOrder]);

  // Verify the address whenever orderState.receiveAddress changes
  useEffect(() => {
    if (orderState.receiveAddress && orderState.id) {
      console.log('[addressVerificationEffect] Verifying current receive address on mount/change');
      verifyReceiveAddress(orderState.receiveAddress).catch(err => {
        console.error('[addressVerificationEffect] Error verifying address:', err);
      });
    } else {
      // Clear verified address if no receive address
      setVerifiedAddress(null);
    }
  }, [orderState.receiveAddress, orderState.id, verifyReceiveAddress]);

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

  // Improved handleSwapSuccess function
  const handleSwapSuccess = useCallback(async () => {
    console.log('[handleSwapSuccess] Swap completed successfully');
    
    // Log current state for debugging
    console.log('[handleSwapSuccess] Current state:', {
      authenticated,
      walletType,
      hasWallet: !!adaptedWallet,
      orderState: {
        id: orderState.id,
        status: orderState.status,
        receiveAddress: orderState.receiveAddress,
        lastUpdated: new Date(orderState.lastUpdated).toLocaleTimeString()
      }
    });
    
    // Get bank details from localStorage
    const storedBank = localStorage.getItem('linkedBankAccount');
    if (!storedBank) {
      console.error('[handleSwapSuccess] No bank details found, cannot process swap');
      return;
    }
    
    try {
      const bankDetails = JSON.parse(storedBank);
      console.log('[handleSwapSuccess] Bank details found:', bankDetails);
      
      // Force create new order after successful swap
      console.log('[handleSwapSuccess] Creating new order for this transaction...');
      const newAddress = await createNewOrder(true);
      
      if (!newAddress) {
        console.error('[handleSwapSuccess] Failed to create new order after swap');
        return;
      }
      
      console.log('[handleSwapSuccess] New receive address created:', newAddress);
      
      // Get the current order ID
      if (!orderState.id) {
        console.error('[handleSwapSuccess] No order ID available after order creation');
        return;
      }
      
      // Create bank account object from stored details
      const bankAccount: BankAccount = {
        currency: 'NGN',
        institution: bankDetails.institution,
        accountIdentifier: bankDetails.accountIdentifier,
        accountName: bankDetails.accountName || '',
        memo: 'DirectPay Offramp'
      };
      
        // Create transaction record
        const transaction: TransactionStatus = {
        id: orderState.id,
          amount: outputValue.toString(),
          nairaAmount: nairaAmount,
        bankAccount: bankAccount,
          status: 'initiated',
        timestamp: Date.now(),
        token: 'USDC',
        rate: paycrestRate.toString(),
        network: 'base'
      };
      
      console.log('[handleSwapSuccess] Created transaction record:', transaction);
        
        // Update transaction history
      setTransactionHistory(prev => [...prev, transaction]);
      
      // Store transaction but don't show modal
      setCurrentTransaction(transaction);
      // Modal display removed as requested
      // setShowTransactionStatus(true);
        
        // Start polling for status updates
        const pollInterval = setInterval(async () => {
          try {
          if (!orderState.id) {
            clearInterval(pollInterval);
            return;
          }
          
          console.log('[handleSwapSuccess] Polling order status for:', orderState.id);
          const status = await checkOrderStatus(orderState.id);
          
            if (status !== 'initiated') {
            clearInterval(pollInterval);
            console.log(`[handleSwapSuccess] Order status changed to: ${status}`);
              
              // Update transaction status
              setTransactionHistory(prev => 
                prev.map(tx => 
                tx.id === orderState.id 
                    ? { ...tx, status }
                    : tx
                )
            );
              
              // Update current transaction if it's being shown
            if (currentTransaction?.id === orderState.id) {
              setCurrentTransaction(prev => prev ? { ...prev, status } : null);
              }
              
            // If status is not settled, create new order
              if (status !== 'settled') {
              console.log('[handleSwapSuccess] Order not settled, creating new order');
              await createNewOrder(true);
              }
            }
          } catch (error) {
          console.error('[handleSwapSuccess] Error polling order status:', error);
          clearInterval(pollInterval);
          }
      }, 5000); // Poll every 5 seconds
        
        // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        console.log('[handleSwapSuccess] Order status polling stopped after timeout');
      }, 5 * 60 * 1000);
      
      // If we have a parent success callback, also call it
      if (onSwapSuccess) {
        console.log('[handleSwapSuccess] Calling parent swap success handler');
        await onSwapSuccess(bankDetails);
      }
      
      console.log('[handleSwapSuccess] Swap handling completed successfully');
    } catch (error) {
      console.error('[handleSwapSuccess] Error handling swap success:', error);
    }
  }, [
    authenticated, 
    walletType, 
    adaptedWallet, 
    orderState.id, 
    orderState.status, 
    orderState.receiveAddress, 
    orderState.lastUpdated,
    createNewOrder,
    checkOrderStatus,
    outputValue,
    nairaAmount,
    paycrestRate,
    currentTransaction,
    onSwapSuccess
  ]);

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

  // Monitor bank account changes and force order refresh
  useEffect(() => {
    let previousBankDetails: string | null = null;
    
    const checkBankChanges = () => {
      const currentBankDetails = localStorage.getItem('linkedBankAccount');
      
      // If we have bank details and they've changed
      if (currentBankDetails && currentBankDetails !== previousBankDetails) {
        // If this isn't the first check (previousBankDetails was set)
        if (previousBankDetails !== null) {
          console.log('[bankMonitor] Bank account changed, forcing new order creation');
          
          try {
            const oldDetails = previousBankDetails ? JSON.parse(previousBankDetails) : null;
            const newDetails = JSON.parse(currentBankDetails);
            
            console.log('[bankMonitor] Bank change details:', {
              from: oldDetails ? `${oldDetails.institution} / ${oldDetails.accountIdentifier}` : 'none',
              to: `${newDetails.institution} / ${newDetails.accountIdentifier}`
            });
            
            // Force a new order creation
            createNewOrder(true).catch(err => {
              console.error('[bankMonitor] Failed to create new order after bank change:', err);
            });
          } catch (err) {
            console.error('[bankMonitor] Error processing bank change:', err);
          }
        }
        
        // Update our reference
        previousBankDetails = currentBankDetails;
      }
    };
    
    // Initial check
    checkBankChanges();
    
    // Set up interval to check for changes
    const interval = setInterval(checkBankChanges, 2000); // Check every 2 seconds
    
    // Also listen for storage events from other tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'linkedBankAccount') {
        checkBankChanges();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [createNewOrder]);

  // Add a direct handler for bank account changes that can be exposed to parent components
  const handleBankAccountChange = useCallback(async (newBankDetails: any) => {
    console.log('[handleBankAccountChange] Bank account changed directly, refreshing order');
    
    // Call the prop callback if provided
    if (onBankAccountChange) {
      onBankAccountChange(newBankDetails);
    }
    
    // Force a new order creation with the new bank details
    try {
      // Small delay to ensure localStorage is updated first
      setTimeout(async () => {
        const result = await createNewOrder(true);
        console.log('[handleBankAccountChange] New order created:', result ? 'success' : 'failed');
      }, 100);
    } catch (err) {
      console.error('[handleBankAccountChange] Error creating new order:', err);
    }
  }, [createNewOrder, onBankAccountChange]);
  
  // Expose the bank account change handler to parent components via ref
  useEffect(() => {
    // If the component has an onBankAccountChange prop, register our handler
    if (onBankAccountChange) {
      // We can expose this function to parent components if needed
      (window as any).handleDirectPayBankChange = handleBankAccountChange;
    }
    
    return () => {
      // Clean up when component unmounts
      delete (window as any).handleDirectPayBankChange;
    };
  }, [handleBankAccountChange, onBankAccountChange]);

  // Handle analytics events - moved to end to fix dependency order
  const handleAnalyticEvent = useCallback((e: any) => {
    if (!e || !e.eventName) return

    console.log('[Widget Event]', e.eventName, e.data)

    // Force update recipient in quote data with actual receive address
    if (e.eventName === 'QUOTE_REQUESTED' && e.data && e.data.parameters) {
      // Extra precaution: Verify the receive address before using it
      (async () => {
        // If we have a receive address, verify it's valid before using
        if (orderState.receiveAddress) {
          const isValid = await verifyReceiveAddress(orderState.receiveAddress);
          
          if (isValid) {
            console.log(`[handleAnalyticEvent] Using verified receive address: ${orderState.receiveAddress}`);
            e.data.parameters.recipient = orderState.receiveAddress;
      } else {
            console.warn('[handleAnalyticEvent] Receive address invalid or expired, creating new order');
            
            // Force create a new order
            const newAddress = await createNewOrder(true);
            
            if (newAddress) {
              console.log(`[handleAnalyticEvent] Using new receive address: ${newAddress}`);
              e.data.parameters.recipient = newAddress;
            } else {
              console.error('[handleAnalyticEvent] Failed to create new order for quote');
            }
          }
        } else {
          console.warn('[handleAnalyticEvent] No receive address available, creating new order');
          
          // Try to create a new order
          const newAddress = await createNewOrder(true);
          
          if (newAddress) {
            console.log(`[handleAnalyticEvent] Using new receive address: ${newAddress}`);
            e.data.parameters.recipient = newAddress;
          } else {
            console.error('[handleAnalyticEvent] Failed to create receive address for quote');
          }
        }
      })().catch(err => {
        console.error('[handleAnalyticEvent] Error handling quote request:', err);
      });
    }
    
    // Handle successful swap - add extra debugging
    if (e.eventName === 'SWAP_SUCCESS') {
      console.log("[handleAnalyticEvent] SWAP_SUCCESS EVENT DETECTED");
      console.log("[handleAnalyticEvent] Swap success data:", JSON.stringify(e.data, null, 2));
      console.log("[handleAnalyticEvent] Creating new Paycrest order after successful swap");
      
      // Track that a swap success occurred
      setSwapSuccessOccurred(true);
      
      try {
        // Handle the swap success (modal won't show due to our previous change)
        handleSwapSuccess();
        console.log("[handleAnalyticEvent] handleSwapSuccess function called successfully");
      } catch (err) {
        console.error("[handleAnalyticEvent] Error in handleSwapSuccess:", err);
      }
    }

    // Handle SWAP_MODAL_CLOSED - if it follows a SWAP_SUCCESS, log the user out
    if (e.eventName === 'SWAP_MODAL_CLOSED' && swapSuccessOccurred) {
      console.log('[handleAnalyticEvent] SWAP_MODAL_CLOSED after SWAP_SUCCESS detected, logging user out');
      setSwapSuccessOccurred(false);
      
      setTimeout(() => {
        if (authenticated && logout) {
          // Clear order state
          clearOrderState();
          
          // Log the user out
          logout()
            .then(() => {
              console.log('[handleAnalyticEvent] User logged out successfully after swap');
              window.location.reload();
            })
            .catch(err => {
              console.error('[handleAnalyticEvent] Failed to log out user:', err);
            });
        }
      }, 1000);
    }
    
    // Handle wallet selector events
    if (e.eventName === 'WALLET_SELECTOR_SELECT') {
      console.log("[handleAnalyticEvent] Wallet selector triggered:", e.data)
      if (e.data && e.data.context === 'not_connected') {
        console.log("[handleAnalyticEvent] Initiating wallet connection flow")
        
        if (e.data.wallet_type && 
            (e.data.wallet_type.toLowerCase().includes('solana') ||
             e.data.wallet_type.toLowerCase().includes('phantom') ||
             e.data.wallet_type.toLowerCase().includes('svm'))) {
          console.log("[handleAnalyticEvent] Setting wallet type to Solana")
          setWalletType('svm')
        }
        
        handleWalletConnection(e.data.wallet_type)
      }
    }
    
    // Dispatch custom event for external listeners
    const customEvent = new CustomEvent('relay-analytic', { detail: { eventName: e.eventName, data: e.data } })
    window.dispatchEvent(customEvent)
  }, [
    orderState.receiveAddress,
    swapSuccessOccurred,
    authenticated,
    logout,
    handleSwapSuccess,
    clearOrderState,
    setWalletType,
    handleWalletConnection,
    verifyReceiveAddress,
    createNewOrder
  ]);

  // Setup event listeners
  useEffect(() => {
    window.addEventListener('relay-analytic', handleAnalyticEvent);
    return () => window.removeEventListener('relay-analytic', handleAnalyticEvent);
  }, [handleAnalyticEvent]);

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
            console.log('Hid Receive section');
          }
        }
      });

      // Update USDC to NGN for specific div
      const amountDivs = document.querySelectorAll('.relay-d_flex.relay-bg_gray2.relay-px_3.relay-py_2.relay-gap_2.relay-rounded_25.relay-text_gray8.relay-items_center .relay-text_text-default.relay-font_body.relay-fw_500.relay-fs_16px');
      amountDivs.forEach(div => {
        const text = div.textContent || '';
        if (text.includes('USDC')) {
          const match = text.match(/([\d.]+)\s*USDC/);
          if (match && match[1]) {
            const usdcAmount = parseFloat(match[1]);
            if (!isNaN(usdcAmount)) {
              const ngnAmount = usdcAmount * paycrestRate;
              const formattedNgn = ngnAmount.toLocaleString('en-NG', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
              div.textContent = `${formattedNgn}`;
              console.log(`Converted ${usdcAmount} USDC to ${formattedNgn} NGN`);
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
              console.log(`Converted 1 ZK = ${zkValue} NGN to 1 ZK = ${formattedNgn} NGN`);
            }
          }
        }
      });

      // Remove the specified div to eliminate its space
      const divsToRemove = document.querySelectorAll('.relay-d_flex.relay-items_center.relay-justify_space-between.relay-gap_3.relay-w_100\\%.__web-inspector-hide-shortcut__');
      divsToRemove.forEach(div => {
        div.remove();
        console.log('Removed div with __web-inspector-hide-shortcut__ to collapse space');
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
          console.log('MutationObserver disconnected');
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

  // Setup MutationObserver for text replacement, conversions, and div removal
  useEffect(() => {
    let observer: MutationObserver | null = null;

    const updateRates = () => {
      // Find all rate elements
      const rateElements = document.querySelectorAll('.relay-text_text-default.relay-font_body.relay-fw_500.relay-fs_14px');
      rateElements.forEach(element => {
        // Skip if already processed
        if (element.getAttribute('data-rate-processed') === 'true') {
          return;
        }
        
        const text = element.textContent || '';
        // Match pattern like "1 TOKEN = X.YYYY"
        const match = text.match(/1\s+(\w+)\s*=\s*([\d.]+)\s*/);
        if (match) {
          const [_, token, rate] = match;
          const numRate = parseFloat(rate);
          if (!isNaN(numRate)) {
            const newRate = numRate * paycrestRate;
            const formattedRate = newRate.toLocaleString('en-NG', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            });
            element.textContent = `1 ${token} = ${formattedRate}`;
            // Mark as processed to prevent infinite multiplication
            element.setAttribute('data-rate-processed', 'true');
          }
        }
      });

      // Update NGN amount elements (the ones with the long class chain)
      const ngnAmountElements = document.querySelectorAll('.relay-text_text-default.relay-font_body.relay-fw_700.relay-fs_16px.relay-text-overflow_ellipsis.relay-overflow_hidden.relay-white-space_nowrap.relay-leading_20px');
      ngnAmountElements.forEach(element => {
        // Skip if already processed
        if (element.getAttribute('data-amount-processed') === 'true') {
          return;
        }
        
        const text = element.textContent || '';
        if (text.includes('NGN')) {
          // Extract number from text like "0.136456 NGN"
          const match = text.match(/([\d.]+)\s*NGN/);
          if (match && match[1]) {
            const amount = parseFloat(match[1]);
            if (!isNaN(amount)) {
              const newAmount = amount * paycrestRate;
              const formattedAmount = newAmount.toLocaleString('en-NG', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6
              });
              element.textContent = `${formattedAmount}`;
              // Mark as processed to prevent infinite multiplication
              element.setAttribute('data-amount-processed', 'true');
              console.log(`Converted NGN amount from ${amount} to ${formattedAmount}`);
            }
          }
        }
      });

      // Change Base to DirectPay
      const baseElements = document.querySelectorAll('.relay-text_text-subtle.relay-font_body.relay-fw_500.relay-fs_14px');
      baseElements.forEach(element => {
        if (element.textContent === 'Base') {
          element.textContent = 'DirectPay';
        }
      });
    };

    const timer = setTimeout(() => {
      updateRates();
      
      observer = new MutationObserver(() => {
        updateRates();
      });

      observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        characterData: true,
        characterDataOldValue: true
      });

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

  return (
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
            <SwapWidget
              fromToken={fromToken}
              setFromToken={(token) => token && setFromTokenState(token)}
              toToken={toToken}
              setToToken={(token) => token && setToTokenState(token)}
              lockFromToken={false}
              lockToToken={true}
              supportedWalletVMs={['evm', 'svm']}
              onConnectWallet={handleWalletConnection}
              defaultToAddress={(verifiedAddress || destinationAddress) as `0x${string}`}
              multiWalletSupportEnabled={true}
              onSetPrimaryWallet={() => {}}
              onLinkNewWallet={() => {}}
              linkedWallets={[]}
              wallet={adaptedWallet}
              onAnalyticEvent={handleAnalyticEvent}
              slippageTolerance={slippageTolerance}
              onSwapSuccess={handleSwapSuccess}
            />
            
            {/* Move slippage config to bottom */}
            <div className="slippage-config-container">
              <button
                onClick={() => setShowSlippageConfig(!showSlippageConfig)}
                className="slippage-button"
              >
                Slippage: {slippageTolerance ? `${slippageTolerance}%` : 'Auto'}
              </button>
              
              {showSlippageConfig && (
                <div className="slippage-dropdown">
                  <SlippageToleranceConfig
                    setSlippageTolerance={setSlippageTolerance}
                    onAnalyticEvent={(eventName, data) => {
                      console.log('Slippage Config Event:', eventName, data);
                    }}
                  />
                </div>
              )}
            </div>
            
            {/* Responsive debug info */}
            <div style={{ 
              position: 'absolute', 
              bottom: '8px', 
              left: '12px', 
              fontSize: '9px', 
              color: 'rgba(255,255,255,0.3)',
              userSelect: 'none',
              maxWidth: '80%',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis'
            }}>
              {walletType || 'None'} | {paycrestRate.toFixed(2)} | {orderStatus}
            </div>
            
            {/* Responsive overlay for Naira amount */}
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
                zIndex: 1000,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: '250px',
                height: '50px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                maxWidth: 'calc(100% - 40px)'
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
          </RelayKitProvider>
        )}
      </div>
      {/* Transaction status modal removed as requested */}
      {/* {showTransactionStatus && currentTransaction && (
        <TransactionStatusModal
          transaction={currentTransaction}
          onClose={() => setShowTransactionStatus(false)}
          transactions={transactionHistory}
          showHistory={true}
        />
      )} */}
    </div>
  )
}

if (typeof window !== 'undefined') {
  const styleId = 'swap-widget-wrapper-styles';
  if (!document.getElementById(styleId)) {
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
        background: #23262f; 
        border-radius: 16px; 
        box-shadow: 0 10px 25px rgba(0,0,0,0.08), 0 5px 10px rgba(0,0,0,0.05); 
        padding: 24px 20px; 
        width: 100%; 
        margin: 0 auto; 
        position: relative;
        border: 1px solid rgba(255,255,255,0.05);
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
        }
        
        .responsive-overlay {
          width: 220px !important;
        }
      }
      
      @media (max-width: 374px) {
        .swap-card {
          padding: 16px 12px;
        }
        
        .responsive-overlay {
          width: 200px !important;
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

      /* Updated slippage config styles */
      .slippage-config-container {
        position: relative;
        width: 100%;
        display: flex;
        justify-content: flex-end;
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }
      
      .slippage-button {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 6px 12px;
        color: rgba(255,255,255,0.7);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-right: 4px;
      }
      
      .slippage-button:hover {
        background: rgba(255,255,255,0.1);
        border-color: rgba(255,255,255,0.2);
      }
      
      .slippage-dropdown {
        position: absolute;
        top: auto;
        bottom: calc(100% + 4px);
        right: 4px;
        background: #2A2D36;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        min-width: 200px;
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
    `;
    document.head.appendChild(style);
  }
}