'use client'

import { useState, useEffect } from 'react'
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { ArrowPathIcon } from '@heroicons/react/24/solid'
import { checkTransactionStatus } from '@/utils/paycrest'

interface TransactionTrackerProps {
  orderId: string | null
  transactionAmount: number
  nairaAmount: string
  bankDetails: any
  onGoBack: () => void
  onNewTransaction: () => void
}

export default function TransactionTracker({
  orderId,
  transactionAmount,
  nairaAmount,
  bankDetails,
  onGoBack,
  onNewTransaction,
}: TransactionTrackerProps) {
  const [status, setStatus] = useState<string>('pending')
  const [progress, setProgress] = useState(0)
  const [isPolling, setIsPolling] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [pastTransactions, setPastTransactions] = useState<any[]>([])

  // Load past transactions from localStorage
  useEffect(() => {
    const storedTransactions = localStorage.getItem('pastTransactions')
    if (storedTransactions) {
      setPastTransactions(JSON.parse(storedTransactions))
    }
  }, [])

  // Store the current transaction in history
  useEffect(() => {
    if (orderId && status !== 'pending') {
      const transaction = {
        id: orderId,
        status,
        amount: transactionAmount,
        nairaAmount,
        bankDetails: {
          institution: bankDetails?.institution,
          accountIdentifier: bankDetails?.accountIdentifier,
          accountName: bankDetails?.accountName || 'Unknown'
        },
        timestamp: new Date().toISOString()
      }

      // Update transaction if exists, otherwise add it
      const existingIndex = pastTransactions.findIndex(t => t.id === orderId)
      if (existingIndex >= 0) {
        const updatedTransactions = [...pastTransactions]
        updatedTransactions[existingIndex] = transaction
        setPastTransactions(updatedTransactions)
        localStorage.setItem('pastTransactions', JSON.stringify(updatedTransactions))
      } else if (status !== 'pending') {
        const updatedTransactions = [transaction, ...pastTransactions].slice(0, 10) // Keep only most recent 10
        setPastTransactions(updatedTransactions)
        localStorage.setItem('pastTransactions', JSON.stringify(updatedTransactions))
      }
    }
  }, [orderId, status, transactionAmount, nairaAmount, bankDetails])

  // Poll for transaction status
  useEffect(() => {
    if (!orderId || !isPolling) return
    
    let pollCounter = 0
    const maxPolls = 30 // Maximum number of polls (5 minutes at 10s intervals)
    
    const pollStatus = async () => {
      pollCounter++
      
      try {
        // Update progress based on time passed
        setProgress(Math.min(95, pollCounter * 3.3)) // Max at 95% until confirmed
        
        // Call the transaction status API
        const response = await checkTransactionStatus(orderId)
        
        if (response && response.status === 'success' && response.data) {
          const txStatus = response.data.status
          console.log('Transaction status update:', txStatus)
          setStatus(txStatus)
          
          // Stop polling if we have a final status
          if (txStatus === 'settled' || txStatus === 'refunded' || txStatus === 'expired') {
            setProgress(100)
            setIsPolling(false)
          }
        }
      } catch (err) {
        console.error('Error polling transaction status:', err)
        
        // Only show error after multiple failed attempts
        if (pollCounter > 3) {
          setErrorMessage('Could not retrieve transaction status. Will keep trying...')
        }
      }
      
      // Stop polling after max attempts
      if (pollCounter >= maxPolls && status === 'pending') {
        setIsPolling(false)
        setErrorMessage('Transaction is taking longer than expected. Please check your bank account or contact support.')
      }
    }
    
    // Poll every 10 seconds
    const interval = setInterval(pollStatus, 10000)
    pollStatus() // Initial call
    
    return () => clearInterval(interval)
  }, [orderId, isPolling, status])

  // Get status display information
  const getStatusInfo = () => {
    switch (status) {
      case 'pending':
        return {
          title: 'Transaction In Progress',
          description: 'Your transaction is being processed. Please wait while we confirm the payment.',
          icon: <ClockIcon className="h-12 w-12 text-yellow-500" />,
          color: 'bg-yellow-100 border-yellow-300'
        }
      case 'settled':
        return {
          title: 'Transaction Complete',
          description: `${nairaAmount} NGN has been successfully sent to your bank account.`,
          icon: <CheckCircleIcon className="h-12 w-12 text-green-500" />,
          color: 'bg-green-100 border-green-300'
        }
      case 'refunded':
        return {
          title: 'Transaction Refunded',
          description: 'Your transaction was refunded. The funds have been returned to your wallet.',
          icon: <ArrowPathIcon className="h-12 w-12 text-blue-500" />,
          color: 'bg-blue-100 border-blue-300'
        }
      case 'expired':
        return {
          title: 'Transaction Expired',
          description: 'Your transaction has expired. You may need to create a new transaction.',
          icon: <XCircleIcon className="h-12 w-12 text-red-500" />,
          color: 'bg-red-100 border-red-300'
        }
      default:
        return {
          title: 'Transaction Status Unknown',
          description: 'We could not determine the status of your transaction.',
          icon: <XCircleIcon className="h-12 w-12 text-gray-500" />,
          color: 'bg-gray-100 border-gray-300'
        }
    }
  }
  
  const statusInfo = getStatusInfo()
  
  // Format account identifier with asterisks for privacy
  const formatAccountNumber = (accountNumber: string) => {
    if (!accountNumber) return '****'
    return accountNumber.length > 4 
      ? `****${accountNumber.slice(-4)}` 
      : accountNumber
  }

  const renderTransactionHistory = () => {
    if (pastTransactions.length === 0) {
      return (
        <div className="text-center py-4 text-gray-500">
          No transaction history available
        </div>
      )
    }
    
    return (
      <div className="space-y-4 mt-4">
        <h3 className="font-semibold text-gray-700">Recent Transactions</h3>
        {pastTransactions.map((tx, index) => (
          <div key={index} className={`p-4 rounded-lg border ${
            tx.status === 'settled' ? 'border-green-200 bg-green-50' :
            tx.status === 'refunded' ? 'border-blue-200 bg-blue-50' :
            tx.status === 'expired' ? 'border-red-200 bg-red-50' :
            'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">
                  {tx.nairaAmount} NGN
                  <span className="ml-2 text-sm font-normal text-gray-500">({tx.amount.toFixed(6)} USDC)</span>
                </p>
                <p className="text-sm text-gray-600">
                  {tx.bankDetails.institution} • {formatAccountNumber(tx.bankDetails.accountIdentifier)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(tx.timestamp).toLocaleDateString()} {new Date(tx.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex items-center">
                {tx.status === 'settled' && <CheckCircleIcon className="h-5 w-5 text-green-500" />}
                {tx.status === 'refunded' && <ArrowPathIcon className="h-5 w-5 text-blue-500" />}
                {tx.status === 'expired' && <XCircleIcon className="h-5 w-5 text-red-500" />}
                {tx.status === 'pending' && <ClockIcon className="h-5 w-5 text-yellow-500" />}
                <span className="ml-2 text-sm capitalize">{tx.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-auto">
      <div className="flex justify-between items-center mb-6">
        <button 
          onClick={onGoBack}
          className="flex items-center text-gray-600 hover:text-black"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back
        </button>
        
        <button 
          onClick={() => setShowHistory(!showHistory)}
          className="text-blue-600 text-sm font-medium hover:text-blue-800"
        >
          {showHistory ? 'Hide History' : 'View History'}
        </button>
      </div>
      
      {showHistory ? (
        renderTransactionHistory()
      ) : (
        <>
          <div className={`rounded-lg border p-6 mb-6 text-center ${statusInfo.color}`}>
            <div className="flex justify-center mb-4">
              {statusInfo.icon}
            </div>
            <h2 className="text-xl font-bold mb-2">{statusInfo.title}</h2>
            <p className="text-gray-700">{statusInfo.description}</p>
          </div>
          
          {status === 'pending' && (
            <div className="mb-6">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className="flex justify-between mt-2 text-sm text-gray-500">
                <span>Processing</span>
                <span>Confirming</span>
                <span>Completed</span>
              </div>
            </div>
          )}
          
          <div className="rounded-lg border border-gray-200 p-4 mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">Transaction Details</h3>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-500">Amount:</div>
              <div className="text-right font-medium">{transactionAmount.toFixed(6)} USDC</div>
              
              <div className="text-gray-500">Value:</div>
              <div className="text-right font-medium">{nairaAmount} NGN</div>
              
              <div className="text-gray-500">Bank:</div>
              <div className="text-right font-medium">{bankDetails?.institution || 'Unknown'}</div>
              
              <div className="text-gray-500">Account:</div>
              <div className="text-right font-medium">{formatAccountNumber(bankDetails?.accountIdentifier)}</div>
              
              <div className="text-gray-500">Recipient:</div>
              <div className="text-right font-medium truncate max-w-[150px]">
                {bankDetails?.accountName || 'Unknown'}
              </div>
              
              <div className="text-gray-500">Order ID:</div>
              <div className="text-right font-medium text-xs truncate max-w-[150px]">
                {orderId || 'Unknown'}
              </div>
            </div>
          </div>
          
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">
              {errorMessage}
            </div>
          )}
          
          {status !== 'pending' && (
            <button
              onClick={onNewTransaction}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition"
            >
              New Transaction
            </button>
          )}
        </>
      )}
    </div>
  )
} 