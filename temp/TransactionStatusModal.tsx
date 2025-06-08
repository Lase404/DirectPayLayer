import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

// Define TransactionStatus interface
export interface TransactionStatus {
  id: string;
  amount: string;
  amountPaid?: string;
  amountReturned?: string;
  nairaAmount?: string;
  token: string;
  senderFee?: string;
  transactionFee?: string;
  rate: string;
  network: string;
  gatewayId?: string;
  reference?: string;
  bankAccount: {
    currency: string;
    institution: string;
    accountIdentifier: string;
    accountName: string;
    memo: string;
  };
  status: 'initiated' | 'settled' | 'refunded' | 'expired';
  timestamp: number;
  txHash?: string;
}

interface TransactionStatusModalProps {
  transaction: TransactionStatus;
  onClose: () => void;
  onSaveBeneficiary?: (bankDetails: any) => void;
}

const TransactionStatusModal: React.FC<TransactionStatusModalProps> = ({ 
  transaction, 
  onClose,
  onSaveBeneficiary 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [showHistory, setShowHistory] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<TransactionStatus[]>([]);
  const [isBeneficiarySaved, setIsBeneficiarySaved] = useState(false);
  
  // Load transaction history from localStorage on mount
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem('transactionHistory');
      if (storedHistory) {
        setTransactionHistory(JSON.parse(storedHistory));
      }
    } catch (error) {
      console.error('Failed to load transaction history:', error);
    }
    
    // Check if this bank is already saved as a beneficiary
    const checkBeneficiary = () => {
      try {
        const storedBeneficiaries = localStorage.getItem('savedBeneficiaries');
        if (storedBeneficiaries) {
          const beneficiaries = JSON.parse(storedBeneficiaries);
          const exists = beneficiaries.some((b: any) => 
            b.accountIdentifier === transaction.bankAccount.accountIdentifier &&
            b.institution === transaction.bankAccount.institution
          );
          setIsBeneficiarySaved(exists);
        }
      } catch (error) {
        console.error('Error checking beneficiaries:', error);
      }
    };
    
    checkBeneficiary();
  }, [transaction]);
  
  // Auto-refresh status for initiated transactions
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (transaction.status === 'initiated') {
      interval = setInterval(() => {
        setIsRefreshing(true);
        // Simulate status check - in real app, replace with actual API call
        setTimeout(() => {
          setIsRefreshing(false);
          setLastUpdate(Date.now());
        }, 1000);
      }, 10000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [transaction.status]);

  // Calculate Naira amount based on transaction data
  const getNairaAmount = () => {
    // If nairaAmount is already provided, use it
    if (transaction.nairaAmount) {
      return transaction.nairaAmount;
    }
    
    // For initiated status, use amount field
    if (transaction.status === 'initiated' || !transaction.amountPaid || parseFloat(transaction.amountPaid) === 0) {
      const amount = parseFloat(transaction.amount);
      const rate = parseFloat(transaction.rate);
      const nairaValue = amount * rate;
      
      return nairaValue.toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    
    // For settled status, use amountPaid field
    const amountPaid = parseFloat(transaction.amountPaid);
    const rate = parseFloat(transaction.rate);
    const nairaValue = amountPaid * rate;
    
    return nairaValue.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };
  
  const getStatusColor = () => {
    switch (transaction.status) {
      case 'settled': return 'bg-green-500';
      case 'refunded': return 'bg-yellow-500';
      case 'expired': return 'bg-red-500';
      default: return 'bg-blue-500';
    }
  };
  
  const getStatusMessage = () => {
    switch (transaction.status) {
      case 'settled':
        return 'Transaction completed';
      case 'refunded':
        return 'Refunded to wallet';
      case 'expired':
        return 'Transaction expired';
      default:
        return 'Transaction in progress';
    }
  };
  
  const handleSaveBeneficiary = () => {
    if (onSaveBeneficiary && transaction.bankAccount) {
      const beneficiary = {
        institution: transaction.bankAccount.institution,
        accountIdentifier: transaction.bankAccount.accountIdentifier,
        accountName: transaction.bankAccount.accountName,
        memo: transaction.bankAccount.memo || 'Payment via DirectPay'
      };
      
      // Save to localStorage
      try {
        const storedBeneficiaries = localStorage.getItem('savedBeneficiaries');
        const beneficiaries = storedBeneficiaries ? JSON.parse(storedBeneficiaries) : [];
        
        // Check if beneficiary already exists
        const exists = beneficiaries.some((b: any) => 
          b.accountIdentifier === beneficiary.accountIdentifier &&
          b.institution === beneficiary.institution
        );
        
        if (!exists) {
          beneficiaries.push(beneficiary);
          localStorage.setItem('savedBeneficiaries', JSON.stringify(beneficiaries));
          setIsBeneficiarySaved(true);
        }
        
        if (onSaveBeneficiary) {
          onSaveBeneficiary(beneficiary);
        }
      } catch (error) {
        console.error('Failed to save beneficiary:', error);
      }
    }
  };

  // Get bank name and logo
  const getBankName = (code: string) => {
    // This would normally come from a utility function
    const bankNames: Record<string, string> = {
      'GTBINGLA': 'GTBank',
      'ZENITHBANK': 'Zenith Bank',
      'ACCESSBANK': 'Access Bank',
      // Add more banks as needed
    };
    
    return bankNames[code] || code;
  };
  
  const getBankLogo = (code: string) => {
    // This would normally come from a utility function
    // Return a placeholder or actual bank logo URL
    return `/bank-logos/${code.toLowerCase()}.png`;
  };

  const bankName = getBankName(transaction.bankAccount.institution);

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center">
      <div className={`mx-4 mt-3 w-full max-w-md rounded-lg shadow-lg bg-white`}>
        {/* Compact View */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              {transaction.status === 'initiated' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <div className={`w-5 h-5 rounded-full ${getStatusColor()} ${transaction.status === 'initiated' ? 'opacity-30' : ''}`}></div>
            </div>
            <div>
              <p className="font-medium text-sm text-gray-700">{getStatusMessage()}</p>
              <p className="text-lg font-bold text-gray-900">₦{getNairaAmount()}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isExpanded ? (
                  <polyline points="18 15 12 9 6 15"></polyline>
                ) : (
                  <polyline points="6 9 12 15 18 9"></polyline>
                )}
              </svg>
            </button>
            
            <button 
              onClick={onClose}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Expanded View */}
        {isExpanded && (
          <div className="border-t border-gray-200">
            <div className="px-4 py-3 space-y-4">
              {/* Transaction Details */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Amount</p>
                    <p className="font-medium">
                      {transaction.status === 'settled' && transaction.amountPaid ? 
                        `${transaction.amountPaid} ${transaction.token}` : 
                        `${transaction.amount} ${transaction.token}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Naira Value</p>
                    <p className="font-medium">₦{getNairaAmount()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Exchange Rate</p>
                    <p className="font-medium">₦{Number(transaction.rate).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Transaction Date</p>
                    <p className="font-medium">{new Date(transaction.timestamp).toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Bank Details */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold">
                        {bankName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Bank</p>
                        <p className="font-medium">{bankName}</p>
                      </div>
                    </div>
                    {!isBeneficiarySaved && (
                      <button 
                        onClick={handleSaveBeneficiary}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                          <polyline points="17 21 17 13 7 13 7 21"></polyline>
                          <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                        Save
                      </button>
                    )}
                    {isBeneficiarySaved && (
                      <span className="text-xs text-green-600 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                          <path d="M20 6L9 17l-5-5"></path>
                        </svg>
                        Saved
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-500">Account Number</p>
                      <p className="font-medium">{transaction.bankAccount.accountIdentifier}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Account Name</p>
                      <p className="font-medium">{transaction.bankAccount.accountName}</p>
                    </div>
                  </div>
                </div>

                {/* Transaction ID */}
                <div>
                  <p className="text-xs text-gray-500">Transaction ID</p>
                  <p className="text-xs font-medium text-gray-700 break-all">{transaction.id}</p>
                  {transaction.reference && (
                    <>
                      <p className="text-xs text-gray-500 mt-2">Reference</p>
                      <p className="text-xs font-medium text-gray-700 break-all">{transaction.reference}</p>
                    </>
                  )}
                  {transaction.txHash && (
                    <>
                      <p className="text-xs text-gray-500 mt-2">Transaction Hash</p>
                      <p className="text-xs font-medium text-gray-700 break-all">{transaction.txHash}</p>
                    </>
                  )}
                </div>

                {/* Additional Actions */}
                <div className="flex justify-between items-center py-2">
                  <button 
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {showHistory ? 'Hide History' : 'View History'}
                  </button>
                  <span className="text-xs text-gray-500">
                    Last updated: {new Date(lastUpdate).toLocaleTimeString()}
                  </span>
                </div>

                {/* Status-specific Messages */}
                {transaction.status === 'refunded' && (
                  <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      Your funds have been refunded to your wallet. If you don't see the funds, please contact support.
                    </p>
                  </div>
                )}
                
                {transaction.status === 'expired' && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                    <p className="text-sm text-red-800">
                      This transaction has expired. Please create a new transaction if you wish to proceed.
                    </p>
                  </div>
                )}
              </div>

              {/* Transaction History */}
              {showHistory && (
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <h3 className="font-medium text-gray-900 mb-2">Transaction History</h3>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {transactionHistory.length > 0 ? (
                      transactionHistory.map((tx) => (
                        <div key={tx.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex justify-between">
                            <div>
                              <p className="font-medium">₦{tx.nairaAmount || 
                                (parseFloat(tx.amount) * parseFloat(tx.rate)).toLocaleString('en-NG', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}</p>
                              <p className="text-xs text-gray-500">{getBankName(tx.bankAccount.institution)}</p>
                            </div>
                            <div className="text-right">
                              <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                                tx.status === 'settled' ? 'bg-green-100 text-green-800' : 
                                tx.status === 'refunded' ? 'bg-yellow-100 text-yellow-800' :
                                tx.status === 'expired' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {tx.status}
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(tx.timestamp).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-gray-500 py-4">No transaction history</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionStatusModal; 