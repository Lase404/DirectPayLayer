'use client'

import { useState, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { getRatesForOfframp } from '@/utils/paycrest'

// Constants
const DEFAULT_DESTINATION_ADDRESS = '0x1a84de15BD8443d07ED975a25887Fc4E6779DfaF'

// Helper function to detect Solana addresses
const isSolanaAddress = (address: string): boolean => {
  // Solana addresses are base58 encoded strings, typically 32-44 characters
  // They don't start with 0x like Ethereum addresses
  return typeof address === 'string' && 
         !address.startsWith('0x') && 
         /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

type Institution = {
  name: string
  code: string
  type: 'bank' | 'mobile_money'
}

type BankAccount = {
  institution: string
  code: string
  accountIdentifier: string
  accountName: string
}

export function BankLinkingForm({ onLinked }: { onLinked?: (bank: BankAccount) => void }) {
  const { login, authenticated, user } = usePrivy()
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [selectedInstitution, setSelectedInstitution] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get user's wallet address
  const walletAddress = user?.wallet?.address

  // Fetch supported institutions
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setIsLoading(true)
        const response = await fetch('https://api.paycrest.io/v1/institutions/ngn')
        if (!response.ok) throw new Error(`Error fetching institutions: ${response.status}`)
        const data = await response.json()
        if (data.status === 'success' && Array.isArray(data.data)) {
          setInstitutions(data.data)
        } else {
          throw new Error('Invalid response format')
        }
      } catch (error) {
        setError('Failed to load bank list. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }
    fetchInstitutions()
  }, [])

  // Handle institution selection
  const handleInstitutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedInstitution(e.target.value)
    setIsVerified(false)
    setAccountName('')
  }

  // Handle account number input
  const handleAccountNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAccountNumber(e.target.value)
    setIsVerified(false)
    setAccountName('')
  }

  // Verify account number
  const verifyAccount = async () => {
    if (!selectedInstitution) return setError('Please select a bank')
    if (!accountNumber || accountNumber.length < 10) return setError('Please enter a valid account number')
    try {
      setIsVerifying(true)
      setError(null)
      const response = await fetch('https://api.paycrest.io/v1/verify-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institution: selectedInstitution, accountIdentifier: accountNumber })
      })
      if (!response.ok) throw new Error(`Error verifying account: ${response.status}`)
      const data = await response.json()
      if (data.status === 'success') {
        setAccountName(data.data)
        setIsVerified(true)
        setError(null)
      } else {
        throw new Error(data.message || 'Failed to verify account')
      }
    } catch (error) {
      setError('Failed to verify account. Please check your details and try again.')
      setIsVerified(false)
    } finally {
      setIsVerifying(false)
    }
  }

  // Create Paycrest order and store receiveAddress
  const createPaycrestOrder = async (bankDetails: BankAccount) => {
    if (!authenticated) {
      setError('Please connect your wallet first')
      await login()
      return
    }

    if (!user?.wallet?.address) {
      setError('No wallet address available')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      // Get current rate from Paycrest
      const rates = await getRatesForOfframp()
      if (!rates || !rates.NGN) {
        throw new Error('Failed to fetch current rate')
      }
      
      // Determine the return address based on wallet type
      let returnAddress = user.wallet.address
      
      // Check if the wallet is a Solana address
      if (isSolanaAddress(returnAddress)) {
        console.log('Solana wallet detected, using default destination address')
        returnAddress = DEFAULT_DESTINATION_ADDRESS
      }
      
      const orderBody = {
        amount: '0.5',
        rate: rates.NGN.toString(),
        network: 'base',
        token: 'USDC',
        recipient: {
          institution: bankDetails.code,
          accountIdentifier: bankDetails.accountIdentifier,
          accountName: bankDetails.accountName,
          memo: 'DirectPay Offramp'
        },
        returnAddress: returnAddress,
        feePercent: 2
      }

      console.log('Creating Paycrest order with payload:', orderBody)

      const response = await fetch('/api/paycrest-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderBody)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create Paycrest order')
      }

      if (data.status === 'success' && data.data && data.data.receiveAddress) {
        // Save both bank and receiveAddress
        localStorage.setItem('linkedBankAccount', JSON.stringify(bankDetails))
        localStorage.setItem('paycrestReceiveAddress', data.data.receiveAddress)
        
        // Dispatch a storage event to notify other components
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'paycrestReceiveAddress',
          newValue: data.data.receiveAddress,
          url: window.location.href
        }))
        
        // Call the onLinked callback instead of refreshing
        if (onLinked) {
          onLinked(bankDetails)
        }
      } else {
        throw new Error('Failed to get receive address from Paycrest')
      }
    } catch (error) {
      console.error('Error creating order:', error)
      setError(error instanceof Error ? error.message : 'Failed to link bank. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!authenticated) {
      setError('Please connect your wallet first')
      await login()
      return
    }

    if (!isVerified) {
      return verifyAccount()
    }

    // Find institution name for display
    const institutionName = institutions.find(inst => inst.code === selectedInstitution)?.name || selectedInstitution
    const bankDetails: BankAccount = {
      institution: institutionName,
      code: selectedInstitution,
      accountIdentifier: accountNumber,
      accountName: accountName
    }
    createPaycrestOrder(bankDetails)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!authenticated && (
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-medium text-primary-900 mb-2">Connect Your Wallet</h3>
          <p className="text-primary-700 text-sm mb-4">
            Connect your wallet to securely link your bank account and start receiving payments.
          </p>
          <button
            type="button"
            onClick={() => login()}
            className="w-full bg-primary-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="bank">
            Select Bank
          </label>
          <div className="relative">
            <select
              id="bank"
              value={selectedInstitution}
              onChange={handleInstitutionChange}
              className="block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 rounded-lg"
              disabled={isLoading || isSubmitting || !authenticated}
              required
            >
              <option value="">Choose your bank</option>
              {institutions.map((institution) => (
                <option key={institution.code} value={institution.code}>
                  {institution.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="accountNumber">
            Account Number
          </label>
          <input
            id="accountNumber"
            type="text"
            value={accountNumber}
            onChange={handleAccountNumberChange}
            className="block w-full px-3 py-2.5 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 rounded-lg"
            pattern="[0-9]*"
            inputMode="numeric"
            minLength={10}
            maxLength={10}
            placeholder="Enter 10-digit account number"
            required
            disabled={isSubmitting || !authenticated}
          />
        </div>

        {isVerified && (
          <div className="bg-green-50 border border-green-100 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="text-sm text-green-800 font-medium">Account Verified</p>
                <p className="text-sm text-green-700">{accountName}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-lg p-4">
            <div className="flex">
              <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!authenticated || isVerifying || isLoading || isSubmitting || (!isVerified && !accountNumber)}
          className={`w-full py-2.5 px-4 rounded-lg font-medium transition-colors ${
            !authenticated || isVerifying || isLoading || isSubmitting || (!isVerified && !accountNumber)
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-primary-600 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
          }`}
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Linking Account...
            </div>
          ) : isVerifying ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Verifying...
            </div>
          ) : isVerified ? (
            'Link Bank Account'
          ) : (
            'Verify Account'
          )}
        </button>
      </div>
    </form>
  )
} 