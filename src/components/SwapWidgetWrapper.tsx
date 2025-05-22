'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { SwapWidget } from '@reservoir0x/relay-kit-ui'
import { useAccount, useWalletClient } from 'wagmi'
import { SUPPORTED_CHAINS } from '@/utils/bridge'
import { usePrivy } from '@privy-io/react-auth'
import '@/styles/relay-overrides.css'
import { getRatesForOfframp } from '@/utils/paycrest'
import { adaptViemWallet } from '@reservoir0x/relay-sdk'
import { adaptSolanaWallet } from '@/utils/solanaAdapter'
import { VersionedTransaction } from '@solana/web3.js'
import axios from 'axios'

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

// Constants
const DEFAULT_DESTINATION_ADDRESS = '0x1a84de15BD8443d07ED975a25887Fc4E6779DfaF'
const DEFAULT_RATE = 1600
const ORDER_REFRESH_INTERVAL = 30 * 60 * 1000 // 30 minutes in milliseconds
const ORDER_CHECK_INTERVAL = 60 * 1000 // 1 minute in milliseconds

// Update the component to accept props
interface SwapWidgetWrapperProps {
  onSwapSuccess?: (bankDetails?: any) => Promise<string | null>;
}

export default function SwapWidgetWrapper({ onSwapSuccess }: SwapWidgetWrapperProps) {
  const { login, authenticated, user, ready, linkWallet } = usePrivy()
  const { data: walletClient } = useWalletClient()
  const containerRef = useRef<HTMLDivElement>(null)
  
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
  
  // Get wallet information from Privy
  useEffect(() => {
    const setupWallet = async () => {
      if (!ready || !user) return;
      
      try {
        // Check for EVM wallet
        if (walletClient) {
          const adapted = adaptViemWallet(walletClient);
          setAdaptedWallet(adapted);
          setWalletType('evm');
          console.log("EVM wallet adapted:", adapted);
          return;
        }
        
        // Check for Solana wallet in user's linked wallets from Privy
        console.log("Checking for Solana wallet in Privy user object:", user);
        
        // Access the wallets from the user object (Privy API may vary)
        // @ts-ignore - The Privy User type might not include wallets property in all versions
        if (user.wallets && user.wallets.length > 0) {
          // Look for a Solana wallet
          // @ts-ignore
          const solanaWallet = user.wallets.find((wallet: any) => {
            // Different Privy versions might structure this differently
            // Look for any property indicating a Solana wallet
            const walletStr = JSON.stringify(wallet).toLowerCase();
            return walletStr.includes('solana') || 
                   walletStr.includes('phantom') || 
                   walletStr.includes('svm');
          });
          
          if (solanaWallet) {
            console.log("Found potential Solana wallet:", solanaWallet);
            
            // Here you would use your adaptSolanaWallet utility
            // For now, just log that we found it
            setWalletType('svm');
            console.log("Solana wallet detected but not fully implemented");
          }
        }
        
      } catch (err) {
        console.error("Error setting up wallet:", err);
      }
    };
    
    setupWallet();
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
    
    const numValue = parseFloat(value)
      
      if (isNaN(numValue)) {
      console.warn("Invalid output value:", value)
      return
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

  // Setup event listeners
  useEffect(() => {
    // Setup event listener for quote events
    const handleAnalyticEvent = (e: any) => {
      const { eventName, data } = e.detail || {};
      
      if (eventName === 'quote:requested') {
        console.log("Quote requested");
        setIsLoading(true);
      }
      
      if (eventName === 'quote:created' || eventName === 'quote:updated') {
        console.log("Quote received:", data);
        setIsLoading(false);
        
        // Try to update based on toAmount if available
        if (data && data.toAmount) {
          console.log("Output amount from quote:", data.toAmount);
          
          // Parse the toAmount and update the Naira display
          try {
            const toAmountStr = String(data.toAmount);
            const cleanedAmountStr = toAmountStr.replace(/,/g, '');
            const toAmountNum = Number(cleanedAmountStr);
            
            if (!isNaN(toAmountNum) && isFinite(toAmountNum)) {
              // Convert USDC to Naira
              const nairaValue = toAmountNum * paycrestRate;
              const formattedNaira = nairaValue.toLocaleString('en-NG', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
              
              console.log(`Setting Naira from quote event: ${formattedNaira} (${toAmountNum} * ${paycrestRate})`);
              setNairaAmount(formattedNaira);
              setOutputValue(toAmountNum);
            }
          } catch (err) {
            console.error("Error parsing toAmount from quote:", err);
          }
        }
      }
    };
    
    window.addEventListener('relay-analytic', handleAnalyticEvent);
    
    return () => {
      window.removeEventListener('relay-analytic', handleAnalyticEvent);
    };
  }, [paycrestRate]);

  const handleWalletConnection = async (connectorType?: string) => {
    console.log("Wallet connection requested, type:", connectorType);
    
    if (!authenticated) {
      console.log("User not authenticated, initiating login");
      await login();
    } else if (connectorType) {
      console.log("Connecting specific wallet type:", connectorType);
      // Handle specific connector types if needed
      if (connectorType.toLowerCase().includes('solana') || 
          connectorType.toLowerCase().includes('phantom')) {
        console.log("Connecting Solana wallet");
        // Special handling for Solana if needed
      }
      await linkWallet();
    } else {
      console.log("Connecting additional wallet");
      await linkWallet();
    }
  };

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
        // Match pattern like "1 TOKEN = X.YYYY NGN"
        const match = text.match(/1\s+(\w+)\s*=\s*([\d.]+)\s*NGN/);
        if (match) {
          const [_, token, rate] = match;
          const numRate = parseFloat(rate);
          if (!isNaN(numRate)) {
            const newRate = numRate * paycrestRate;
            const formattedRate = newRate.toLocaleString('en-NG', {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4
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

  // Enhanced order management function
  const createNewOrder = async (forceCreate = false) => {
    try {
      // Get bank details from localStorage
      const storedBank = localStorage.getItem('linkedBankAccount')
      if (!storedBank) {
        console.warn('No bank details found, cannot create order')
        return null
      }
      
      const bankDetails = JSON.parse(storedBank)
      
      // Get current time and check if we need a new order
      const now = Date.now()
      const lastOrderTime = parseInt(localStorage.getItem('lastOrderTimestamp') || '0')
      
      // Only check for existing order if not forced to create a new one
      if (!forceCreate) {
        // If it hasn't been 30 minutes since the last order was created
        if (now - lastOrderTime < ORDER_REFRESH_INTERVAL) {
          // Check if we already have a valid order
          const storedAddress = localStorage.getItem('paycrestReceiveAddress')
          const storedOrderId = localStorage.getItem('paycrestOrderId')
          
          if (storedAddress && storedOrderId) {
            console.log('Using existing valid order:', storedOrderId)
            setDestinationAddress(storedAddress)
            return storedAddress
          }
        }
      }
      
      // If we reach here, either forceCreate is true or we need a new order
      console.log('Creating new Paycrest order', forceCreate ? '(forced)' : '')
      
      // Step 1: Get account name and rate in parallel
      const verifyAccountEndpoint = "https://api.paycrest.io/v1/verify-account"
      const nairaRateEndpoint = "https://api.paycrest.io/v1/rates/usdc/1/ngn"
      
      try {
        const [accountNameResponse, nairaRateResponse] = await Promise.all([
          fetch(verifyAccountEndpoint, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "API-Key": "208a4aef-1320-4222-82b4-e3bca8781b4b"
            },
            body: JSON.stringify({
              institution: bankDetails.institution,
              accountIdentifier: bankDetails.accountIdentifier
            })
          }),
          fetch(nairaRateEndpoint, {
            headers: { 
              "API-Key": "208a4aef-1320-4222-82b4-e3bca8781b4b"
            }
          })
        ])
        
        if (!accountNameResponse.ok || !nairaRateResponse.ok) {
          console.error('Failed to fetch account details or rate')
          return null
        }
        
        const accountData = await accountNameResponse.json()
        const rateData = await nairaRateResponse.json()
        
        if (!accountData.data || !rateData.data) {
          console.error('Invalid response from Paycrest API')
          return null
        }
        
        const accountName = accountData.data?.accountName || "Unknown Account"
        const rate = rateData.data || DEFAULT_RATE
        
        console.log('Account verification successful:', accountName)
        console.log('Current Naira rate:', rate)
        
        // Step 2: Create the order with the correct payload format
        const createOrderEndpoint = "https://api.paycrest.io/v1/sender/orders"
        
        // Get connected wallet address for return address, fallback to default
        const walletAddress = connectedAddress || localStorage.getItem('connectedWalletAddress') || DEFAULT_DESTINATION_ADDRESS
        
        // Generate a unique reference
        const reference = `directpay-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        
        // Create order with the required payload format
        const orderPayload = {
          amount: 100.00, // Minimum amount for order creation
          token: "USDC",
          rate: rate,
          network: "base", // Using base network for USDC
          recipient: {
            institution: bankDetails.institution,
            accountIdentifier: bankDetails.accountIdentifier,
            accountName: accountName,
            memo: "Payment via DirectPay"
          },
          returnAddress: walletAddress,
          reference: reference
        }
        
        console.log('Sending order payload:', orderPayload)
        
        const orderResponse = await fetch(createOrderEndpoint, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "API-Key": "208a4aef-1320-4222-82b4-e3bca8781b4b"
          },
          body: JSON.stringify(orderPayload)
        })
        
        if (!orderResponse.ok) {
          const errorText = await orderResponse.text()
          console.error('Failed to create Paycrest order:', orderResponse.status, errorText)
          return null
        }
        
        const orderData = await orderResponse.json()
        
        if (!orderData.data) {
          console.error('Order creation failed:', orderData.message || 'Unknown error')
          return null
        }
        
        console.log('Order creation successful:', orderData.data)
        
        // Save order details
        localStorage.setItem('paycrestOrderId', orderData.data.id)
        localStorage.setItem('paycrestReference', reference)
        localStorage.setItem('paycrestValidUntil', orderData.data.validUntil)
        localStorage.setItem('lastOrderTimestamp', now.toString())
        
        // Save and use the new receive address
        const receiveAddress = orderData.data.receiveAddress
        if (receiveAddress) {
          console.log('New receive address generated:', receiveAddress)
          localStorage.setItem('paycrestReceiveAddress', receiveAddress)
          setDestinationAddress(receiveAddress)
          
          // Save connected wallet address for future use
          if (walletAddress && walletAddress !== DEFAULT_DESTINATION_ADDRESS) {
            localStorage.setItem('connectedWalletAddress', walletAddress)
          }
          
          // Trigger storage event for other components
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'paycrestReceiveAddress',
            newValue: receiveAddress
          }))
          
          // Mark last valid order
          lastValidOrderRef.current = {
            address: receiveAddress,
            timestamp: now
          }
          
          setOrderStatus('valid')
          return receiveAddress
        }
        
        return null
      } catch (error) {
        console.error('API request failed:', error)
        return null
      }
    } catch (error) {
      console.error('Error creating order:', error)
      return null
    }
  }

  // Periodic order check and refresh - every 30 minutes
  useEffect(() => {
    // Create this function outside the effect
    const checkAndUpdateOrder = () => {
      const now = Date.now()
      const lastOrderTime = parseInt(localStorage.getItem('lastOrderTimestamp') || '0')
      
      // Create new order if:
      // 1. No last order time (first load)
      // 2. It's been more than 30 minutes since last order
      if (lastOrderTime === 0 || now - lastOrderTime >= ORDER_REFRESH_INTERVAL) {
        console.log('Order expired or missing, creating new order')
        createNewOrder(true).catch(err => {
          console.error('Failed to create new order:', err)
        })
        } else {
        // Log time remaining until next refresh
        const minutesRemaining = Math.floor((ORDER_REFRESH_INTERVAL - (now - lastOrderTime)) / 60000)
        console.log(`Order still valid. Next refresh in ${minutesRemaining} minutes`)
      }
    }

    // Run check immediately
    checkAndUpdateOrder()

    // Set up interval to check every minute
    const interval = setInterval(checkAndUpdateOrder, ORDER_CHECK_INTERVAL)
    
    return () => clearInterval(interval)
  }, [lastOrderTime])

  // Handle swap success event
  const handleSwapSuccess = async () => {
    console.log('Swap successful, creating new order...')
    
    // Get bank details from localStorage
    const storedBank = localStorage.getItem('linkedBankAccount')
    if (!storedBank) {
      console.warn('No bank details found, cannot create order after swap')
      return
    }
    
    try {
      // Force create new order after successful swap
      // Using true parameter to force creation regardless of time since last order
      const newAddress = await createNewOrder(true)
      console.log('New receive address after successful swap:', newAddress)
      
      // If we have a parent success callback, also call it
      if (onSwapSuccess) {
        console.log('Calling parent swap success handler with bank details')
        await onSwapSuccess(JSON.parse(storedBank))
      }
    } catch (error) {
      console.error('Failed to create new order after swap:', error)
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
          <>
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
              onAnalyticEvent={(eventName, data) => {
                console.log(`[Widget Event] ${eventName}`, data)
                
                // Force update recipient in quote data
                if (eventName === 'QUOTE_REQUESTED' && data && data.parameters) {
                  console.log(`ENFORCING RECIPIENT IN QUOTE REQUEST:`, destinationAddress)
                  data.parameters.recipient = destinationAddress
                }
                
                // Handle successful swap
                if (eventName === 'SWAP_SUCCESS') {
                  console.log("SWAP_SUCCESS event detected, creating new address")
                  handleSwapSuccess()
                }
                
                // Handle wallet selector events
                if (eventName === 'WALLET_SELECTOR_SELECT') {
                  console.log("Wallet selector triggered:", data)
                  if (data && data.context === 'not_connected') {
                    console.log("Initiating wallet connection flow")
                    handleWalletConnection(data.wallet_type)
                  }
                }
                
                const customEvent = new CustomEvent('relay-analytic', { detail: { eventName, data } })
                window.dispatchEvent(customEvent)
              }}
            />
            
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
          </>
        )}
      </div>
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
    `;
    document.head.appendChild(style);
  }
}
