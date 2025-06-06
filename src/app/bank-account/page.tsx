'use client'

import { useState, useEffect } from 'react'
import { BankLinkingForm } from '@/components/BankLinking/BankLinkingForm'
import SwapWidgetWrapper from '@/components/SwapWidgetWrapper'
import Image from 'next/image'
import { usePrivy } from '@privy-io/react-auth'
import { getBankLogoFromPaycrestCode } from '@/utils/banks'
import { useRouter } from 'next/navigation'

// Add a constant for the API key
const PAYCREST_API_KEY = "208a4aef-1320-4222-82b4-e3bca8781b4b";

export default function BankAccountRedirect() {
  const router = useRouter()
  
  useEffect(() => {
    router.replace('/swap')
  }, [router])
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-600">Redirecting to new location...</p>
      </div>
    </div>
  )
} 