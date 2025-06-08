'use client'

import { useState, useEffect } from 'react'
import { BankLinkingForm } from '@/components/BankLinking/BankLinkingForm'
import SwapWidgetWrapper from '@/components/SwapWidgetWrapper'
import Image from 'next/image'
import { usePrivy } from '@privy-io/react-auth'
import { getBankLogoFromPaycrestCode } from '@/utils/banks'

// Add a constant for the API key
const PAYCREST_API_KEY = "208a4aef-1320-4222-82b4-e3bca8781b4b";

export default function BankAccountPage() {
  const { logout, authenticated, login } = usePrivy()
  const [showBankForm, setShowBankForm] = useState(false)
  const [bankDetails, setBankDetails] = useState<any>(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [userProgress, setUserProgress] = useState<'initial' | 'bank_linked' | 'ready'>('initial')
  const [paycrestOrderId, setPaycrestOrderId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Check for saved bank and order details on mount
  useEffect(() => {
    const storedBank = localStorage.getItem('linkedBankAccount')
    const storedOrderId = localStorage.getItem('paycrestOrderId')
    
    if (storedBank) {
      setBankDetails(JSON.parse(storedBank))
      
      if (authenticated) {
        setUserProgress('ready')
      } else {
        setUserProgress('bank_linked')
      }
    } else {
      setUserProgress('initial')
    }
    
    if (storedOrderId) {
      setPaycrestOrderId(storedOrderId)
    }
  }, [authenticated])

  // Handle bank account linking
  const handleBankLinked = async (bank: any) => {
    setBankDetails(bank)
    setShowBankForm(false)
    
    // Create a new order when bank is linked
    if (authenticated) {
      await createNewOrder()
      setUserProgress('ready')
    } else {
      setUserProgress('bank_linked')
    }
  }

  // Create new Paycrest order with bank details
  const createNewOrder = async () => {
    try {
      const bank = bankDetails || bankDetails;
      if (!bank) return null;
      
      console.log('Creating new Paycrest order with bank details:', bank);
      
      // Step 1: Get account name and rate in parallel
      const verifyAccountEndpoint = "https://api.paycrest.io/v1/verify-account";
      const nairaRateEndpoint = "https://api.paycrest.io/v1/rates/usdc/1/ngn";
      
      try {
        const [accountNameResponse, nairaRateResponse] = await Promise.all([
          fetch(verifyAccountEndpoint, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "API-Key": PAYCREST_API_KEY
            },
            body: JSON.stringify({
              institution: bank.institution,
              accountIdentifier: bank.accountIdentifier
            })
          }),
          fetch(nairaRateEndpoint, {
            headers: { 
              "API-Key": PAYCREST_API_KEY
            }
          })
        ]);
        
        if (!accountNameResponse.ok || !nairaRateResponse.ok) {
          console.error('Failed to fetch account details or rate');
          return null;
        }
        
        const accountData = await accountNameResponse.json();
        const rateData = await nairaRateResponse.json();
        
        if (!accountData.data || !rateData.data) {
          console.error('Invalid response from Paycrest API');
          return null;
        }
        
        const accountName = accountData.data?.accountName || "Unknown Account";
        const rate = rateData.data || 1500; // Default fallback rate
        
        console.log('Account verification successful:', accountName);
        console.log('Current Naira rate:', rate);
        
        // Step 2: Create the order with the correct payload format
        const createOrderEndpoint = "https://api.paycrest.io/v1/sender/orders";
        
        // Get connected wallet address for return address, fallback to default
        const walletAddress = localStorage.getItem('connectedWalletAddress') || "0x1a84de15BD8443d07ED975a25887Fc4E6779DfaF";
        
        // Generate a unique reference
        const reference = `directpay-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Create order with the required payload format
        const orderPayload = {
          amount: 0.5, // Minimum amount for order creation
          token: "USDC",
          rate: rate,
          network: "base", // Using base network for USDC
          recipient: {
            institution: bank.institution,
            accountIdentifier: bank.accountIdentifier,
            accountName: accountName,
            memo: "Payment via DirectPay"
          },
          returnAddress: walletAddress,
          reference: reference
        };
        
        console.log('Sending order payload:', orderPayload);
        
        const orderResponse = await fetch(createOrderEndpoint, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "API-Key": PAYCREST_API_KEY
          },
          body: JSON.stringify(orderPayload)
        });
        
        if (!orderResponse.ok) {
          const errorText = await orderResponse.text();
          console.error('Failed to create Paycrest order:', orderResponse.status, errorText);
          return null;
        }
        
        const rawText = await orderResponse.text();
        let orderData;
        try {
          orderData = JSON.parse(rawText);
        } catch (err) {
          console.error('[FATAL-ORDER-ERROR] Failed to parse API response JSON:', err);
          return null;
        }
        
        const orderId = orderData?.data?.id;
        
        if (!orderId || typeof orderId !== 'string') {
          console.error(`[FATAL-ORDER-ERROR] Order ID not found or invalid in response.`);
          return null;
        }
        
        const receiveAddress = orderData.data.receiveAddress;
        if (!receiveAddress) {
          console.error('[FATAL-ORDER-ERROR] receiveAddress not found in response data.');
          return null;
        }
        
        console.log(`[ORDER-SUCCESS] Storing new order details. ID: ${orderId}, Address: ${receiveAddress}`);

        try {
            console.log('---SAVE-STEP-1--- Setting paycrestOrderId');
            localStorage.setItem('paycrestOrderId', orderId);
            const idCheck1 = localStorage.getItem('paycrestOrderId');
            console.log(`---SAVE-STEP-1-VERIFY--- ID is now: ${idCheck1}`);
            if (idCheck1 !== orderId) {
                console.error("---FATAL-SAVE-ERROR--- ID FAILED TO SAVE ON STEP 1");
                return null; // Stop execution if this failed
            }

            console.log('---SAVE-STEP-2--- Setting paycrestReceiveAddress');
            localStorage.setItem('paycrestReceiveAddress', receiveAddress);
            const addressCheck1 = localStorage.getItem('paycrestReceiveAddress');
            console.log(`---SAVE-STEP-2-VERIFY--- Address is now: ${addressCheck1}`);
            if (addressCheck1 !== receiveAddress) {
                console.error("---FATAL-SAVE-ERROR--- ADDRESS FAILED TO SAVE ON STEP 2");
            }

            console.log('---SAVE-STEP-3--- Setting other details');
        localStorage.setItem('paycrestReference', reference);
        localStorage.setItem('paycrestValidUntil', orderData.data.validUntil);
        localStorage.setItem('lastOrderTimestamp', Date.now().toString());
        
            console.log('---SAVE-STEP-4--- Calling setPaycrestOrderId (React state)');
            setPaycrestOrderId(orderId);
            console.log('---SAVE-COMPLETE---');

        } catch(e) {
            console.error("---FATAL-SAVE-ERROR--- An exception occurred during the localStorage save process.", e);
            return null;
        }
          
          // Save connected wallet address for future use
          if (walletAddress && walletAddress !== "0x1a84de15BD8443d07ED975a25887Fc4E6779DfaF") {
            localStorage.setItem('connectedWalletAddress', walletAddress);
          }
          
          // Trigger a storage event for other components
          window.dispatchEvent(new StorageEvent('storage', {
            key: 'paycrestReceiveAddress',
            newValue: receiveAddress
          }));
          
          return receiveAddress;
      } catch (error) {
        console.error('API request failed:', error);
        return null;
      }
    } catch (error) {
      console.error('Error creating order:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectWallet = async () => {
    await login()
    
    // If bank is already linked, create order and set to ready
    if (bankDetails) {
      await createNewOrder()
      setUserProgress('ready')
    }
  }

  const handleLogout = async () => {
    localStorage.removeItem('paycrestOrderId')
    localStorage.removeItem('paycrestReceiveAddress')
    localStorage.removeItem('linkedBankAccount')
    setUserProgress('initial')
    setBankDetails(null)
    setPaycrestOrderId(null)
    await logout()
    window.location.reload()
  }

  const handleChangeBankAccount = () => {
    setShowBankForm(true)
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Professional Header */}
      <header className="w-full bg-white shadow-sm py-3 px-4 sticky top-0 z-30 border-b border-gray-100">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo with subtle enhancement */}
          <div className="flex items-center">
            <Image 
              src="/directpay-logo-new.png" 
              alt="DirectPay" 
              width={180} 
              height={45} 
              className="h-8 sm:h-10 w-auto"
              priority
            />
          </div>
          
          {/* Enhanced Desktop Menu with Status Indicators */}
          <div className="hidden sm:flex items-center space-x-3">
            {bankDetails ? (
              <div className="flex items-center">
                <div className="bg-gray-50 py-1.5 px-3 rounded-l-lg flex items-center border border-r-0 border-gray-200">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                    <div className="w-5 h-5 mr-2 flex-shrink-0 bg-white rounded-md border border-gray-100 overflow-hidden">
                      <Image 
                        src={getBankLogoFromPaycrestCode(bankDetails.institution)}
                        alt={bankDetails.institution}
                        width={20} 
                        height={20}
                        className="object-contain"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-700">{bankDetails.institution}</span>
                    <span className="mx-1 text-gray-400">•</span>
                    <span className="text-sm text-gray-500">****{bankDetails.accountIdentifier?.slice(-2)}</span>
                  </div>
                </div>
                <button
                  onClick={handleChangeBankAccount}
                  className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 text-sm font-medium py-1.5 px-3 rounded-r-lg transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowBankForm(true)}
                className="flex items-center space-x-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 text-sm font-medium py-1.5 px-3 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Link Bank</span>
              </button>
            )}
            
            {authenticated ? (
              <button
                onClick={handleLogout}
                className="group flex items-center space-x-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-sm font-medium py-1.5 px-3 rounded-lg transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 group-hover:bg-red-500 transition-colors"></div>
                <span>Disconnect</span>
              </button>
            ) : userProgress === 'bank_linked' ? (
              <button
                onClick={handleConnectWallet}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-3 rounded-lg transition-colors flex items-center space-x-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Connect Wallet</span>
              </button>
            ) : null}
        </div>
        
          {/* Improved Mobile Menu Button */}
          <button 
            className="sm:hidden p-2 rounded-md text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              )}
            </svg>
          </button>
        </div>
        
        {/* Enhanced Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="sm:hidden mt-3 border-t border-gray-200 py-3 px-4 bg-white shadow-lg rounded-b-lg animate-slideDown">
            <div className="flex flex-col space-y-3">
              {bankDetails ? (
                <div className="flex flex-col space-y-2">
                  <div className="flex items-center p-2 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                      <div className="w-5 h-5 mr-2 flex-shrink-0 bg-white rounded-md border border-gray-100 overflow-hidden">
                        <Image 
                          src={getBankLogoFromPaycrestCode(bankDetails.institution)}
                          alt={bankDetails.institution}
                          width={20} 
                          height={20}
                          className="object-contain"
                        />
                      </div>
              </div>
                    <div>
                      <span className="text-sm font-medium text-gray-700">{bankDetails.institution}</span>
                      <span className="mx-1 text-gray-400">•</span>
                      <span className="text-xs text-gray-500">****{bankDetails.accountIdentifier?.slice(-2)}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleChangeBankAccount}
                    className="w-full flex items-center justify-center space-x-1.5 bg-white hover:bg-gray-50 border border-blue-200 text-blue-600 text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>Change Bank Account</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setShowBankForm(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>Link Bank Account</span>
                </button>
              )}
              
              {authenticated ? (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center space-x-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span>Disconnect Wallet</span>
                </button>
              ) : userProgress === 'bank_linked' ? (
                <button
                  onClick={() => {
                    handleConnectWallet();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center space-x-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Connect Wallet</span>
                </button>
              ) : null}
            </div>
              </div>
        )}
      </header>

      {/* Enhanced Main Content */}
      <main className="flex-1 relative flex flex-col items-center justify-center py-6 px-4 sm:px-8">
        {userProgress === 'initial' ? (
          /* Improved Initial State UI */
          <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
              <h1 className="text-xl font-bold text-center mb-2">Welcome to DirectPay</h1>
              <p className="text-blue-100 text-center text-sm">Convert crypto to Naira in your bank account instantly</p>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <div className="flex items-center mb-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">1</div>
                  <h2 className="ml-3 font-semibold text-gray-800">Link your bank account</h2>
                </div>
                <div className="flex items-center mb-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">2</div>
                  <h2 className="ml-3 font-semibold text-gray-800">Connect your wallet</h2>
                </div>
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">3</div>
                  <h2 className="ml-3 font-semibold text-gray-800">Swap and receive Naira</h2>
                </div>
              </div>
              
              <button 
                onClick={() => setShowBankForm(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Get Started Now</span>
              </button>
              
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-500">Fast, secure, and reliable crypto to bank transfer service</p>
              </div>
            </div>
          </div>
        ) : userProgress === 'bank_linked' ? (
          /* Enhanced Bank Linked State UI */
          <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-green-50 border-b border-green-100 p-4 flex items-center">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-3">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">Bank Account Linked Successfully</h2>
                <p className="text-xs text-gray-500">One more step to complete setup</p>
              </div>
            </div>
            
            <div className="p-6">
              <div className="bg-gray-50 p-4 rounded-lg mb-6 flex items-center border border-gray-200">
                <svg className="w-6 h-6 text-blue-600 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-gray-800">{bankDetails?.institution}</p>
                  <p className="text-xs text-gray-500">Account ending in ****{bankDetails?.accountIdentifier?.slice(-2)}</p>
                </div>
                <button 
                  onClick={handleChangeBankAccount}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  Change
                </button>
              </div>
              
              <div className="mb-6">
                <div className="flex items-center mb-2 text-gray-700">
                  <svg className="w-5 h-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm">Bank account linked</span>
                </div>
                <div className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="text-sm">Connect wallet to continue</span>
                </div>
              </div>
              
              <button 
                onClick={handleConnectWallet}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Connect Your Wallet</span>
              </button>
            </div>
          </div>
        ) : (
          /* Enhanced Swap Widget Container */
          <div className="w-full max-w-md relative z-10">
            <div className="mb-4 pb-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Swap Crypto to Naira</h2>
              <p className="text-sm text-gray-500">Funds will be sent to your linked bank account</p>
            </div>
            <SwapWidgetWrapper onSwapSuccess={createNewOrder} />
          </div>
        )}
        
        {/* Responsive tag line */}
        {userProgress === 'ready' && (
          <div className="mt-6 text-center px-4">
            <div className="inline-flex items-center space-x-1 bg-blue-50 py-1 px-3 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <p className="text-xs font-medium text-blue-700">Live exchange rates • Instant transfers • Secure</p>
            </div>
          </div>
        )}
      </main>

      {/* Enhanced Bank Form Modal */}
      {showBankForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-md mx-auto p-5 sm:p-6 relative border border-gray-200">
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-800">Link Your Bank Account</h3>
              <button
                onClick={() => setShowBankForm(false)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none p-1 rounded-full hover:bg-gray-100"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <BankLinkingForm
              onLinked={handleBankLinked}
            />
          </div>
        </div>
      )}
      
      {/* Enhanced Footer */}
      <footer className="bg-white border-t border-gray-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-xs text-gray-500 mb-2 sm:mb-0">© 2023 DirectPay. All rights reserved.</p>
          <div className="flex space-x-4">
            <span className="text-xs text-gray-500">Secure Payments</span>
            <span className="text-xs text-gray-500">24/7 Support</span>
            <span className="text-xs text-gray-500">Best Rates</span>
          </div>
        </div>
      </footer>
    </div>
  )
} 