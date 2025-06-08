'use client'

import { useState, useEffect } from 'react'

type BankAccount = {
  institution: string
  code: string
  accountIdentifier: string
  accountName: string
}

export function useBankAccount() {
  const [linkedBank, setLinkedBank] = useState<BankAccount | null>(null)
  const [isLinked, setIsLinked] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

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
          setShowForm(true)
        }
      } catch (error) {
        console.error('Error loading bank account:', error)
        setShowForm(true)
      } finally {
        setIsLoading(false)
      }
    }

    // Avoid hydration issues with Next.js
    if (typeof window !== 'undefined') {
      loadBankAccount()
    } else {
      setIsLoading(false)
    }
  }, [])

  // Link a bank account
  const linkBankAccount = (bankDetails: BankAccount) => {
    try {
      // Save to localStorage
      localStorage.setItem('linkedBankAccount', JSON.stringify(bankDetails))
      
      // Update state
      setLinkedBank(bankDetails)
      setIsLinked(true)
      setShowForm(false)
      
      // In a real app, you might also want to send this to your backend
      console.log('Bank account linked:', bankDetails)
    } catch (error) {
      console.error('Error linking bank account:', error)
    }
  }

  // Remove linked bank account
  const removeBankAccount = () => {
    try {
      // Remove from localStorage
      localStorage.removeItem('linkedBankAccount')
      
      // Update state
      setLinkedBank(null)
      setIsLinked(false)
      setShowForm(true)
    } catch (error) {
      console.error('Error removing bank account:', error)
    }
  }

  return {
    linkedBank,
    isLinked,
    isLoading,
    showForm,
    setShowForm,
    linkBankAccount,
    removeBankAccount
  }
} 