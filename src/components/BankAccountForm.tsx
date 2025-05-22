'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Card } from './Card'
import { Input } from './Input'
import { Button } from './Button'
import { ConnectWallet } from './ConnectWallet'
import { linkBankAccount, BankAccount } from '@/utils/paycrest'

// Simplified list of Nigerian banks
const NIGERIAN_BANKS = [
  { code: '044', name: 'Access Bank' },
  { code: '063', name: 'Access Bank (Diamond)' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '030', name: 'Heritage Bank' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'Suntrust Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank For Africa' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
]

export function BankAccountForm() {
  const { address, isConnected } = useAccount()
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [linkedAccount, setLinkedAccount] = useState<BankAccount | null>(null)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isConnected || !address) {
      setError('Please connect your wallet')
      return
    }
    
    if (!bankCode) {
      setError('Please select a bank')
      return
    }
    
    if (!accountNumber || accountNumber.length !== 10) {
      setError('Please enter a valid 10-digit account number')
      return
    }
    
    try {
      setIsLoading(true)
      setError('')
      
      // In a real app, you'd use address as user ID or have a backend mapping
      const account = await linkBankAccount(
        address,
        accountNumber,
        bankCode
      )
      
      setLinkedAccount(account)
      setSuccess(true)
    } catch (error) {
      console.error('Error linking bank account:', error)
      setError('Failed to link bank account. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <Card 
      title="Link Bank Account" 
      className="max-w-lg w-full mx-auto"
      footer={
        <div className="flex justify-end">
          {!isConnected ? (
            <ConnectWallet />
          ) : (
            <Button
              onClick={handleSubmit}
              isLoading={isLoading}
              disabled={!bankCode || !accountNumber || accountNumber.length !== 10}
              fullWidth
            >
              Link Bank Account
            </Button>
          )}
        </div>
      }
    >
      {success && linkedAccount ? (
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="text-green-800 font-medium text-lg mb-2">Bank Account Linked!</h3>
          <p className="text-green-700 mb-4">
            Your bank account has been successfully linked to your wallet.
          </p>
          <div className="bg-white p-3 rounded border border-green-200">
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Bank:</span>
              <span className="font-medium">{linkedAccount.bankName}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Account Number:</span>
              <span className="font-medium">{linkedAccount.accountNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Account Name:</span>
              <span className="font-medium">{linkedAccount.accountName}</span>
            </div>
          </div>
        </div>
      ) : (
        <form className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-800 p-3 rounded-lg border border-red-200">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Bank
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
            >
              <option value="">Select your bank</option>
              {NIGERIAN_BANKS.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <Input
              label="Account Number"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Enter 10-digit account number"
              fullWidth
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter your 10-digit Nigerian bank account number
            </p>
          </div>
          
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
            <p className="text-blue-800 text-sm">
              Linking your bank account will allow you to receive Naira directly when you sell your crypto.
            </p>
          </div>
        </form>
      )}
    </Card>
  )
} 