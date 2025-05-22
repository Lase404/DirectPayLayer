'use client'

import { useState, useEffect } from 'react'
import SwapWidgetWrapper from '@/components/SwapWidgetWrapper'
import Image from 'next/image'
import Link from 'next/link'

// Mock transaction data type
type Transaction = {
  id: string
  date: string
  amount: string
  status: 'completed' | 'pending' | 'failed'
  sourceAsset: string
  destinationAmount: string
}

type BankAccount = {
  institution: string
  code: string
  accountIdentifier: string
  accountName: string
}

export default function TransactionsPage() {
  const [linkedBank, setLinkedBank] = useState<BankAccount | null>(null)
  const [isLinked, setIsLinked] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load bank account from localStorage on mount
  useEffect(() => {
    const loadBankAccount = () => {
      try {
        const savedBank = localStorage.getItem('linkedBankAccount')
        if (savedBank) {
          const bankData = JSON.parse(savedBank)
          setLinkedBank(bankData)
          setIsLinked(true)
        } else {
          setIsLinked(false)
        }
      } catch (error) {
        console.error('Error loading bank account:', error)
        setIsLinked(false)
      }
    }

    // Avoid hydration issues with Next.js
    if (typeof window !== 'undefined') {
      loadBankAccount()
    }
  }, [])

  // Simulate loading transactions
  useEffect(() => {
    const loadTransactions = async () => {
      setIsLoading(true)
      
      // In a real app, you'd fetch transactions from your API
      // For now, we'll use mock data
      setTimeout(() => {
        setTransactions([
          {
            id: '1',
            date: new Date(Date.now() - 86400000).toLocaleString(),
            amount: '0.25 ETH',
            status: 'completed',
            sourceAsset: 'ETH',
            destinationAmount: '400,562.50 NGN'
          },
          {
            id: '2',
            date: new Date(Date.now() - 172800000).toLocaleString(),
            amount: '100 USDC',
            status: 'completed',
            sourceAsset: 'USDC',
            destinationAmount: '160,225.00 NGN'
          }
        ])
        setIsLoading(false)
      }, 1000)
    }

    if (isLinked) {
      loadTransactions()
    } else {
      setIsLoading(false)
    }
  }, [isLinked])

  // Redirect to bank account page if no bank is linked
  useEffect(() => {
    if (!isLinked && typeof window !== 'undefined') {
      window.location.href = '/bank-account'
    }
  }, [isLinked])

  if (!isLinked) {
    return <div className="p-8">Redirecting to link bank account...</div>
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col items-center">
        {/* Header with logo */}
        <div className="w-full flex justify-between items-center mb-8">
          <Link href="/">
            <Image 
              src="/directpay-logo-new.png" 
              alt="DirectPay Logo" 
              width={150} 
              height={40} 
            />
          </Link>
          
          <Link 
            href="/bank-account" 
            className="text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Manage Bank Account
          </Link>
        </div>
        
        {/* Main content */}
        <div className="w-full max-w-4xl">
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6 col-span-2">
              <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
              
              {isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : transactions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Received
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {transaction.date}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {transaction.amount}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {transaction.destinationAmount}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                ${transaction.status === 'completed' ? 'bg-green-100 text-green-800' : 
                                transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'}`}
                            >
                              {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No transactions yet. Make your first swap below!
                </div>
              )}
            </div>
            
            {/* Bank account info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Bank Account</h2>
              
              {linkedBank && (
                <div>
                  <div className="mb-4">
                    <div className="text-sm text-gray-500">Bank</div>
                    <div className="font-medium">{linkedBank.institution}</div>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-sm text-gray-500">Account Name</div>
                    <div className="font-medium">{linkedBank.accountName}</div>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-sm text-gray-500">Account Number</div>
                    <div className="font-medium">•••• {linkedBank.accountIdentifier.slice(-4)}</div>
                  </div>
                  
                  <Link
                    href="/bank-account"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    Change Bank Account
                  </Link>
                </div>
              )}
        </div>
      </div>
      
          {/* Swap widget */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Swap Assets</h2>
            <div className="bg-gray-50 rounded-lg p-2">
              <SwapWidgetWrapper />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 