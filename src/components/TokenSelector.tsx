'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Input } from './Input'

interface Token {
  symbol: string
  name: string
  address: string
  decimals: number
  logoURI?: string
  chainId?: number | string
  balance?: string
}

interface TokenSelectorProps {
  value: Token
  onChange: (token: Token) => void
  tokens: Token[]
  chainId: number | string
  isLoading?: boolean
}

export function TokenSelector({ value, onChange, tokens, chainId, isLoading = false }: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // Filter tokens based on search term
  const filteredTokens = tokens.filter(token => 
    token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
    token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    token.address.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Sort tokens: first by common symbols, then alphabetically
  const sortedTokens = [...filteredTokens].sort((a, b) => {
    const commonTokens = ['ETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'SOL']
    const aIndex = commonTokens.indexOf(a.symbol)
    const bIndex = commonTokens.indexOf(b.symbol)
    
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return a.symbol.localeCompare(b.symbol)
  })
  
  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 10)
    } else {
      setSearchTerm('')
    }
  }, [isOpen])
  
  // Default token logos for common tokens
  const getDefaultLogo = (symbol: string) => {
    const logoMap: Record<string, string> = {
      'ETH': '/images/eth.png',
      'USDC': '/images/usdc.png',
      'USDT': '/images/usdt.png',
      'SOL': '/images/sol.png',
      'DAI': '/images/dai.png',
      'WBTC': '/images/wbtc.png',
    }
    
    return logoMap[symbol] || '/images/token-placeholder.svg'
  }
  
  // Render a token logo with error handling
  const TokenLogo = ({ symbol, logoURI }: { symbol: string, logoURI?: string }) => {
    const [error, setError] = useState(false)
    const imgSrc = !error && logoURI ? logoURI : getDefaultLogo(symbol)
    
    return (
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
        <img 
          src={imgSrc}
          alt={symbol}
          width={32}
          height={32}
          className="object-contain"
          onError={() => setError(true)}
        />
      </div>
    )
  }
  
  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div 
        className={`flex items-center justify-between p-2 border rounded-lg cursor-pointer hover:border-primary-300 ${isLoading ? 'opacity-70' : ''}`}
        onClick={() => !isLoading && setIsOpen(!isOpen)}
      >
        {isLoading ? (
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
            <div className="space-y-2">
              <div className="h-4 w-12 bg-gray-200 animate-pulse rounded"></div>
              <div className="h-3 w-20 bg-gray-200 animate-pulse rounded"></div>
            </div>
          </div>
        ) : (
          <div className="flex items-center">
            <TokenLogo symbol={value.symbol} logoURI={value.logoURI} />
            <div className="ml-2">
              <div className="font-medium">{value.symbol}</div>
              <div className="text-xs text-gray-500">{value.name}</div>
            </div>
          </div>
        )}
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          viewBox="0 0 20 20" 
          fill="currentColor"
        >
          <path 
            fillRule="evenodd" 
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" 
            clipRule="evenodd" 
          />
        </svg>
      </div>
      
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-auto">
          <div className="p-3 border-b sticky top-0 bg-white z-20">
            <div className="relative">
              <Input
                placeholder="Search tokens by name or address"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                fullWidth
                ref={searchInputRef}
                className="pl-8"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {searchTerm && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setSearchTerm('')}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {tokens.length === 0 ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading tokens...</p>
            </div>
          ) : sortedTokens.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-gray-500">No tokens found matching "{searchTerm}"</p>
              <button
                className="mt-2 text-xs text-primary-600 hover:text-primary-700"
                onClick={() => setSearchTerm('')}
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-80 overflow-auto">
              {sortedTokens.map((token) => (
                <div
                  key={token.address}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    onChange(token)
                    setIsOpen(false)
                    setSearchTerm('')
                  }}
                >
                  <div className="flex items-center">
                    <TokenLogo symbol={token.symbol} logoURI={token.logoURI} />
                    <div className="ml-3">
                      <div className="font-medium">{token.symbol}</div>
                      <div className="text-xs text-gray-500">{token.name}</div>
                    </div>
                  </div>
                  {token.balance && (
                    <div className="text-sm text-gray-700">
                      {parseFloat(token.balance).toFixed(4)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
} 