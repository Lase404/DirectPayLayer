'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Card } from './Card'
import { getTransactionHistory } from '@/utils/paycrest'
import { formatNaira, formatCrypto, truncateAddress } from '@/utils/format'

export function TransactionHistory() {
  const { address, isConnected } = useAccount()
  const [transactions, setTransactions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  
  useEffect(() => {
    async function fetchTransactions() {
      if (!isConnected || !address) return
      
      try {
        setIsLoading(true)
        setError('')
        
        const history = await getTransactionHistory(address)
        setTransactions(history)
      } catch (error) {
        console.error('Error fetching transaction history:', error)
        setError('Failed to load transaction history')
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchTransactions()
  }, [address, isConnected])
  
  // Example transaction data for display
  const mockTransactions = [
    {
      id: '1',
      createdAt: '2023-06-01T12:00:00Z',
      sourceAmount: '0.5',
      sourceAsset: 'ETH',
      destinationAmount: '500000',
      destinationAsset: 'NGN',
      status: 'completed',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    },
    {
      id: '2',
      createdAt: '2023-06-05T14:30:00Z',
      sourceAmount: '100',
      sourceAsset: 'USDT',
      destinationAmount: '95000',
      destinationAsset: 'NGN',
      status: 'completed',
      txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    },
    {
      id: '3',
      createdAt: '2023-06-10T09:15:00Z',
      sourceAmount: '0.2',
      sourceAsset: 'ETH',
      destinationAmount: '200000',
      destinationAsset: 'NGN',
      status: 'processing',
      txHash: '0x890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
    },
  ]
  
  const displayTransactions = transactions.length > 0 ? transactions : mockTransactions
  
  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  
  return (
    <Card title="Transaction History" className="max-w-2xl w-full mx-auto">
      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <svg
            className="animate-spin h-8 w-8 text-primary-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-4 rounded-lg text-center text-red-800">
          {error}
        </div>
      ) : displayTransactions.length === 0 ? (
        <div className="py-8 text-center text-gray-500">
          No transactions found
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  From
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(tx.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCrypto(tx.sourceAmount, tx.sourceAsset)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatNaira(tx.destinationAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${
                          tx.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : tx.status === 'processing'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                    >
                      {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
} 