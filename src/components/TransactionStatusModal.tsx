import React, { useState, useEffect, forwardRef } from 'react';
import Image from 'next/image';
import { getBankLogoFromPaycrestCode, getBankNameFromPaycrestCode } from '@/utils/banks';
import BankAccountDisplay from './BankAccountDisplay';

// Define standard transaction statuses
export type TransactionStatusType = 'initiated' | 'settled' | 'refunded' | 'expired';

// Define structure for bank account data
export interface BankAccount {
  institution: string;
  accountIdentifier: string;
  accountName?: string;
  currency: string;
  memo?: string;
}

// Main transaction status interface
export interface TransactionStatus {
  id: string;
  amount: string;
  nairaAmount: string;
  bankAccount: BankAccount;
  status: TransactionStatusType;
  timestamp: number;
  txHash?: string;
  token: string; // Required: e.g., "USDC"
  rate: string;  // Required: exchange rate used
  network: string; // Required: e.g., "base"
}

// Props for the transaction flow component
interface TransactionFlowProps {
  status: TransactionStatusType;
  bankInstitution: string;
}

// Transaction flow visualization component
const TransactionFlow: React.FC<TransactionFlowProps> = ({ status, bankInstitution }) => {
  // Calculate the progress percentage based on status
  const getProgressPercentage = (): number => {
    switch (status) {
      case 'initiated':
        return 30;
      case 'settled':
        return 100;
      case 'refunded':
        return 50;
      case 'expired':
        return 10;
      default:
        return 0;
    }
  };

  const bankLogo = getBankLogoFromPaycrestCode(bankInstitution);
  const bankName = getBankNameFromPaycrestCode(bankInstitution);

  return (
    <div className="w-full mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="ml-2 font-medium text-blue-900">DirectPay</span>
        </div>
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
            <Image 
              src={bankLogo}
              alt={bankName}
              width={32}
              height={32}
              className="object-contain"
            />
          </div>
          <span className="ml-2 font-medium text-blue-900">{bankName}</span>
        </div>
      </div>
      
      <div className="relative h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out ${status === 'refunded' ? 'bg-orange-500' : status === 'expired' ? 'bg-red-500' : 'bg-blue-500'}`} 
          style={{ width: `${getProgressPercentage()}%` }}
        ></div>
      </div>
      
      <div className="mt-1 text-xs text-gray-500 flex justify-between">
        <span>Transaction Initiated</span>
        <span>Funds Transferred</span>
      </div>
    </div>
  );
};

// Props for the main TransactionStatusModal component
export interface TransactionStatusModalProps {
  transaction: TransactionStatus;
  onClose: () => void;
  showHistory?: boolean;
  transactions?: TransactionStatus[];
}

// Main TransactionStatusModal component using forwardRef
const TransactionStatusModal = forwardRef<HTMLDivElement, TransactionStatusModalProps>(
  ({ transaction, onClose, showHistory = false, transactions = [] }, ref) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [displayHistory, setDisplayHistory] = useState(showHistory);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const [allTransactions, setAllTransactions] = useState<TransactionStatus[]>(transactions);
    
    // Add the current transaction to the transaction list if not already present
    useEffect(() => {
      if (transaction && !allTransactions.find(tx => tx.id === transaction.id)) {
        setAllTransactions(prev => [...prev, transaction]);
      }
    }, [transaction]);
    
    // Auto-close timer for completed transactions
    useEffect(() => {
      if (transaction.status === 'settled') {
        const timer = setTimeout(() => {
          onClose();
        }, 5000); // Close after 5 seconds for completed transactions
        return () => clearTimeout(timer);
      }
    }, [transaction.status, onClose]);
    
    // Calculate summary statistics
    const successfulTransactions = allTransactions
      .filter(tx => tx.status === 'settled')
      .sort((a, b) => b.timestamp - a.timestamp);
    
    const totalAmount = successfulTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const totalNaira = successfulTransactions.reduce((sum, tx) => {
      // Try to parse nairaAmount, fallback to calculation with rate if needed
      try {
        return sum + parseFloat(tx.nairaAmount.replace(/[^\d.-]/g, ''));
      } catch (e) {
        return sum + (parseFloat(tx.amount) * parseFloat(tx.rate));
      }
    }, 0);

    // Filter transactions based on search query and date filter
    const filteredTransactions = successfulTransactions.filter(tx => {
      const matchesSearch = 
        tx.amount.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.nairaAmount.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.bankAccount.institution.toLowerCase().includes(searchQuery.toLowerCase()) ||
        getBankNameFromPaycrestCode(tx.bankAccount.institution).toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.id.toLowerCase().includes(searchQuery.toLowerCase());

      const now = Date.now();
      const txDate = tx.timestamp;
      const matchesDate = 
        dateFilter === 'all' ? true :
        dateFilter === 'today' ? txDate > now - 24 * 60 * 60 * 1000 :
        dateFilter === 'week' ? txDate > now - 7 * 24 * 60 * 60 * 1000 :
        txDate > now - 30 * 24 * 60 * 60 * 1000;

      return matchesSearch && matchesDate;
    });
    
    const getStatusColor = (status: TransactionStatusType) => {
      switch (status) {
        case 'settled': return 'bg-blue-500';
        case 'refunded': return 'bg-yellow-500';
        case 'expired': return 'bg-red-500';
        default: return 'bg-blue-400';
      }
    };
    
    const getStatusMessage = (status: TransactionStatusType) => {
    switch (status) {
      case 'settled':
          return 'Transaction completed successfully!';
      case 'refunded':
          return 'Amount has been refunded to your wallet address';
      case 'expired':
          return 'Transaction expired. Please try again.';
      default:
          return 'Transaction in progress...';
    }
  };

  return (
      <div ref={ref} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 transform transition-all duration-300 ease-in-out">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-blue-900">Transaction Status</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="space-y-4">
            {/* Transaction Flow Visualization */}
            <TransactionFlow 
              status={transaction.status} 
              bankInstitution={transaction.bankAccount.institution} 
            />
            
            {/* Status Bar */}
                <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${getStatusColor(transaction.status)}`} />
              <span className="font-medium text-blue-900">{getStatusMessage(transaction.status)}</span>
              {isRefreshing && (
                <div className="ml-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                </div>
              )}
            </div>
            
            {/* Current Transaction Details */}
            <div className="border-t pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-blue-600">Amount</p>
                  <p className="font-medium text-blue-900">{transaction.amount} {transaction.token}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-600">Naira Value</p>
                  <p className="font-medium text-blue-900">₦{transaction.nairaAmount}</p>
                </div>
              </div>
              
              {/* Bank Account Details with Logo */}
              <div className="mt-4">
                <p className="text-sm text-blue-600 mb-2">Bank Account</p>
                <BankAccountDisplay
                  institution={transaction.bankAccount.institution}
                  accountName={transaction.bankAccount.accountName || ""}
                  accountNumber={transaction.bankAccount.accountIdentifier}
                  memo={transaction.bankAccount.memo}
                  compact={true}
                />
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <div className="space-x-4">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {isExpanded ? 'Show Less' : 'Show More'}
                </button>
                <button
                  onClick={() => setDisplayHistory(!displayHistory)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {displayHistory ? 'Hide History' : 'Show History'}
                </button>
              </div>
              <span className="text-xs text-blue-500">
                Last updated: {new Date(lastUpdate).toLocaleTimeString()}
              </span>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="space-y-2 text-sm border-t pt-4">
                <div>
                  <p className="text-blue-600">Network</p>
                  <p className="font-medium text-blue-900">{transaction.network}</p>
                </div>
                <div>
                  <p className="text-blue-600">Exchange Rate</p>
                  <p className="font-medium text-blue-900">1 {transaction.token} = ₦{transaction.rate}</p>
                </div>
                    <div>
                  <p className="text-blue-600">Transaction ID</p>
                  <p className="font-medium text-blue-900 break-all">{transaction.id}</p>
                    </div>
                {transaction.txHash && (
                  <div>
                    <p className="text-blue-600">Transaction Hash</p>
                    <p className="font-medium text-blue-900 break-all">{transaction.txHash}</p>
                      </div>
                )}
                <div>
                  <p className="text-blue-600">Time</p>
                  <p className="font-medium text-blue-900">
                    {new Date(transaction.timestamp).toLocaleString()}
                  </p>
                    </div>
                {transaction.status === 'refunded' && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-blue-800">
                      The refunded amount has been sent back to your connected wallet address.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Transaction History */}
            {displayHistory && transactions.length > 0 && (
              <div className="mt-4 border-t pt-4">
                {/* Summary Section */}
                <div className="mb-6 grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-600">Total Transactions</p>
                    <p className="text-xl font-semibold text-blue-900">{successfulTransactions.length}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-600">Total {transaction.token}</p>
                    <p className="text-xl font-semibold text-blue-900">{totalAmount.toFixed(2)} {transaction.token}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-600">Total Naira</p>
                    <p className="text-xl font-semibold text-blue-900">₦{totalNaira.toLocaleString()}</p>
                  </div>
                      </div>
                      
                {/* Search and Filter Section */}
                <div className="mb-4 space-y-3">
                  <div className="flex items-center space-x-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Search by amount, bank account, or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-blue-900 placeholder-blue-300"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-400 hover:text-blue-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value as any)}
                      className="px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-blue-900"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="week">Last 7 Days</option>
                      <option value="month">Last 30 Days</option>
                    </select>
                  </div>
                  {searchQuery && (
                    <p className="text-sm text-blue-600">
                      Found {filteredTransactions.length} transactions matching "{searchQuery}"
                    </p>
                  )}
                    </div>
                    
                {/* Transaction List */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((tx) => (
                      <div key={tx.id} className="bg-blue-50 rounded-lg p-3 hover:bg-blue-100 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center">
                            <div className="w-10 h-10 mr-3 overflow-hidden rounded-md border border-gray-100 bg-white flex items-center justify-center">
                          <Image
                                src={getBankLogoFromPaycrestCode(tx.bankAccount.institution)}
                                alt={getBankNameFromPaycrestCode(tx.bankAccount.institution)}
                                width={40}
                                height={40}
                                className="object-contain"
                              />
                            </div>
                          <div>
                              <p className="font-medium text-blue-900">{tx.amount} {tx.token}</p>
                              <p className="text-sm text-blue-600">₦{tx.nairaAmount}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-blue-600">
                              {new Date(tx.timestamp).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-blue-600">
                              {new Date(tx.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2">
                          <p className="text-sm text-blue-600 break-all">
                            {getBankNameFromPaycrestCode(tx.bankAccount.institution)} • {tx.bankAccount.accountIdentifier}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-blue-600 text-center py-4">
                      {searchQuery ? 'No transactions found matching your search' : 'No successful transactions yet'}
                    </p>
                  )}
                        </div>
                          </div>
                        )}
                      </div>
                    </div>
                      </div>
    );
  }
);

// Add display name for better React DevTools debugging
TransactionStatusModal.displayName = 'TransactionStatusModal';

// Explicitly export the component as default
export default TransactionStatusModal; 