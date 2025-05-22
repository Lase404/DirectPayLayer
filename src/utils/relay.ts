'use client'

import { Client, getClient as getRelayClient, ClientConfig, MAINNET_RELAY_API } from '@reservoir0x/relay-sdk'

let client: Client | null = null

// Supported chains configuration
export const SUPPORTED_CHAINS = {
  ETHEREUM: 1,
  POLYGON: 137,
  BASE: 8453,
}

/**
 * Initialize and get the Relay SDK client
 * This is a singleton to avoid multiple initializations
 */
export function getClient(config?: ClientConfig): Client {
  try {
    if (!client) {
      // Initialize the client with default or provided config
      const relayConfig: ClientConfig = config || {
        // Default to mainnet API, users don't need API keys
        relayApiUrl: MAINNET_RELAY_API, 
        // Log client activity for debugging
        logLevel: process.env.NODE_ENV === 'development' ? 3 : 1,
      }
      
      client = getRelayClient(relayConfig)
      console.log('Relay client initialized successfully')
    }
    return client
  } catch (error) {
    console.error('Failed to initialize Relay client', error)
    throw error
  }
}

/**
 * Reset the Relay client (useful for testing or switching configurations)
 */
export function resetClient(): void {
  client = null
}

/**
 * Get supported chains for Relay operations
 */
export async function getSupportedChains() {
  try {
    const relayClient = getClient()
    if (relayClient.getChains) {
      return await relayClient.getChains()
    } else {
      console.log('Using default supported chains')
      // Return default supported chains from constant
      return [
        { id: SUPPORTED_CHAINS.ETHEREUM, name: 'Ethereum' },
        { id: SUPPORTED_CHAINS.POLYGON, name: 'Polygon' },
        { id: SUPPORTED_CHAINS.BASE, name: 'Base' },
      ]
    }
  } catch (error) {
    console.error('Error getting supported chains:', error)
    // Fallback to default chains
    return [
      { id: SUPPORTED_CHAINS.ETHEREUM, name: 'Ethereum' },
      { id: SUPPORTED_CHAINS.POLYGON, name: 'Polygon' },
      { id: SUPPORTED_CHAINS.BASE, name: 'Base' },
    ]
  }
} 