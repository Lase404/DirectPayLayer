'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { getSupportedChains } from '@/utils/relay'

interface Chain {
  id: number
  name: string
  logoURI?: string
}

interface ChainSelectorProps {
  selectedChainId: number
  onChange: (chainId: number) => void
  disabled?: boolean
  className?: string
}

export function ChainSelector({ 
  selectedChainId, 
  onChange, 
  disabled = false,
  className = '' 
}: ChainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [chains, setChains] = useState<Chain[]>([])
  const [loading, setLoading] = useState(true)
  
  // Chain logos
  const chainLogos: Record<number, string> = {
    1: '/images/ethereum.svg',
    137: '/images/polygon.svg',
    8453: '/images/base.svg',
  }
  
  // Get chain name and logo
  const getChainDetails = (chainId: number): { name: string, logo: string } => {
    const chain = chains.find(c => c.id === chainId)
    return {
      name: chain?.name || `Chain ${chainId}`,
      logo: chainLogos[chainId] || '/images/chain-placeholder.svg'
    }
  }
  
  // Fetch supported chains
  useEffect(() => {
    async function fetchChains() {
      try {
        setLoading(true)
        const supportedChains = await getSupportedChains()
        setChains(supportedChains)
      } catch (error) {
        console.error('Error loading chains:', error)
        // Fallback to default chains
        setChains([
          { id: 1, name: 'Ethereum' },
          { id: 137, name: 'Polygon' },
          { id: 8453, name: 'Base' }
        ])
      } finally {
        setLoading(false)
      }
    }
    
    fetchChains()
  }, [])
  
  // Get details of selected chain
  const { name: selectedName, logo: selectedLogo } = getChainDetails(selectedChainId)
  
  return (
    <div className={`relative ${className}`}>
      <div 
        className={`
          flex items-center justify-between p-2 border rounded-lg 
          ${disabled ? 'bg-gray-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary-300'}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex items-center">
          <div className="w-6 h-6 rounded-full overflow-hidden mr-2">
            <img 
              src={selectedLogo}
              alt={selectedName}
              width={24}
              height={24}
              className="object-contain"
            />
          </div>
          <span className={`font-medium ${disabled ? 'text-gray-500' : 'text-gray-900'}`}>
            {selectedName}
          </span>
        </div>
        
        {!disabled && (
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
        )}
      </div>
      
      {isOpen && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-auto">
          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading chains...</p>
            </div>
          ) : (
            <div className="py-1">
              {chains.map((chain) => (
                <div
                  key={chain.id}
                  className={`
                    flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer
                    ${selectedChainId === chain.id ? 'bg-gray-50' : ''}
                  `}
                  onClick={() => {
                    onChange(chain.id)
                    setIsOpen(false)
                  }}
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden mr-2">
                    <img 
                      src={chainLogos[chain.id] || '/images/chain-placeholder.svg'}
                      alt={chain.name}
                      width={24}
                      height={24}
                      className="object-contain"
                    />
                  </div>
                  <span className="font-medium">
                    {chain.name}
                  </span>
                  
                  {selectedChainId === chain.id && (
                    <svg className="ml-auto h-5 w-5 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
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