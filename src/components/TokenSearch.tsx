'use client'

import { useState, useEffect, useMemo } from 'react'
import { MAINNET_RELAY_API } from '@reservoir0x/relay-sdk'
import { useTokenList } from '@reservoir0x/relay-kit-hooks'
import { useAccount } from 'wagmi'
import { Input } from './Input'
import Image from 'next/image'

interface Token {
  address: string
  name: string
  symbol: string
  decimals: number
  chainId: number
  logoURI?: string
  balance?: string
  balanceUsd?: string
  price?: number
}

interface TokenSearchProps {
  selectedToken?: Token | null
  onSelectToken: (token: Token) => void
  chainId: number
  defaultList?: boolean
  className?: string
}

export function TokenSearch({ 
  selectedToken, 
  onSelectToken, 
  chainId,
  defaultList = true,
  className = ''
}: TokenSearchProps) {
  const { address } = useAccount()
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  
  // Use the Relay SDK hook to get token list
  const { data: tokenListResponse, isLoading } = useTokenList(
    MAINNET_RELAY_API, 
    {
      chainIds: [chainId],
      defaultList,
      term: searchTerm.length > 0 ? searchTerm : undefined,
      address,
      verified: true,
      limit: 20
    }
  )
  
  // Sort tokens: popular ones first, then by name
  const sortedTokens = useMemo(() => {
    if (!tokenListResponse?.tokens) return []
    
    const popularSymbols = ['ETH', 'WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
    
    return [...tokenListResponse.tokens].sort((a, b) => {
      // Popular tokens first
      const aIsPopular = popularSymbols.includes(a.symbol);
      const bIsPopular = popularSymbols.includes(b.symbol);
      
      if (aIsPopular && !bIsPopular) return -1;
      if (!aIsPopular && bIsPopular) return 1;
      
      // If both are popular, sort by position in popularSymbols
      if (aIsPopular && bIsPopular) {
        return popularSymbols.indexOf(a.symbol) - popularSymbols.indexOf(b.symbol);
      }
      
      // Sort by name for non-popular tokens
      return a.name.localeCompare(b.name);
    });
  }, [tokenListResponse?.tokens]);

  // Default image if token logo fails to load
  const getDefaultLogo = (symbol: string) => {
    return `/images/token-placeholder.svg`;
  }
  
  const handleToggleDropdown = () => {
    setIsOpen(!isOpen);
  }
  
  const handleSelectToken = (token: Token) => {
    onSelectToken(token);
    setIsOpen(false);
  }
  
  return (
    <div className={`relative ${className}`}>
      <div 
        className="flex items-center justify-between p-3 border rounded-md cursor-pointer"
        onClick={handleToggleDropdown}
      >
        {selectedToken ? (
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full mr-2 overflow-hidden bg-gray-100 flex items-center justify-center">
              {selectedToken.logoURI ? (
                <Image 
                  src={selectedToken.logoURI}
                  alt={selectedToken.symbol}
                  width={32}
                  height={32}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getDefaultLogo(selectedToken.symbol)
                  }}
                />
              ) : (
                <Image 
                  src={getDefaultLogo(selectedToken.symbol)}
                  alt={selectedToken.symbol}
                  width={32}
                  height={32}
                />
              )}
            </div>
            <div>
              <div className="font-medium">{selectedToken.symbol}</div>
              <div className="text-xs text-gray-500">{selectedToken.name}</div>
            </div>
          </div>
        ) : (
          <div className="text-gray-500">Select token</div>
        )}
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-5 w-5 text-gray-400" 
          viewBox="0 0 20 20" 
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
      
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-96 overflow-y-auto">
          <div className="p-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or address"
              className="w-full mb-2"
            />
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-6 h-6 border-t-2 border-primary-500 rounded-full animate-spin"></div>
              <span className="ml-2 text-gray-500">Loading tokens...</span>
            </div>
          ) : sortedTokens.length > 0 ? (
            <div className="py-1">
              {sortedTokens.map((token) => (
                <div
                  key={token.address}
                  className="flex items-center justify-between px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => handleSelectToken(token)}
                >
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full mr-2 overflow-hidden bg-gray-100 flex items-center justify-center">
                      {token.logoURI ? (
                        <Image 
                          src={token.logoURI}
                          alt={token.symbol}
                          width={32}
                          height={32}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getDefaultLogo(token.symbol)
                          }}
                        />
                      ) : (
                        <Image 
                          src={getDefaultLogo(token.symbol)}
                          alt={token.symbol}
                          width={32}
                          height={32}
                        />
                      )}
                    </div>
                    <div>
                      <div className="font-medium">{token.symbol}</div>
                      <div className="text-xs text-gray-500">{token.name}</div>
                    </div>
                  </div>
                  
                  {token.balance && (
                    <div className="text-right">
                      <div className="font-medium">{token.balance}</div>
                      {token.balanceUsd && (
                        <div className="text-xs text-gray-500">${token.balanceUsd}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 px-4 text-center text-gray-500">
              No tokens found. Try a different search term.
            </div>
          )}
        </div>
      )}
    </div>
  )
} 