'use client'

import { RelayKitProvider } from '@reservoir0x/relay-kit-ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet } from 'viem/chains'
import { MAINNET_RELAY_API, createClient } from '@reservoir0x/relay-sdk'
import '@reservoir0x/relay-kit-ui/styles.css'
import { useState, useEffect } from 'react'
import type { Chain } from 'viem'
import { PrivyProvider } from '@privy-io/react-auth'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'
import { useRelayChains } from '@/hooks/useRelayChains'

// Initialize the Relay SDK client
createClient({
  baseApiUrl: MAINNET_RELAY_API,
  source: "directpay.app"
})

const queryClient = new QueryClient()

// This is your Privy app ID 

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''

function RelayProviders({ children }: { children: React.ReactNode }) {
  const [wagmiConfig, setWagmiConfig] = useState<ReturnType<typeof createConfig> | undefined>()
  const { chains, viemChains } = useRelayChains(MAINNET_RELAY_API)

  useEffect(() => {
    if (!wagmiConfig && viemChains) {
      const supportedChains = viemChains.length > 0 ? viemChains : [mainnet]
      setWagmiConfig(
        createConfig({
          chains: supportedChains as [Chain, ...Chain[]],
          transports: Object.fromEntries(
            supportedChains.map((chain: Chain) => [chain.id, http()])
          )
        })
      )
    }
  }, [viemChains])

  if (!wagmiConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Loading chains...</h2>
          <p className="text-sm text-gray-500">Please wait while we configure supported networks</p>
        </div>
      </div>
    )
  }

  return (
    <RelayKitProvider
      options={{
        chains,
        baseApiUrl: MAINNET_RELAY_API
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <PrivyProvider
          appId={PRIVY_APP_ID}
          config={{
            loginMethods: ['wallet', 'email', 'google'],
            appearance: {
              theme: 'light',
              accentColor: '#4F46E5',
              showWalletLoginFirst: true,
              walletChainType: 'ethereum-and-solana', // Enable Solana UI elements
              walletList: [
                'detected_wallets',
                'metamask', 
                'phantom', 
                'solflare', 
                'backpack',
                'coinbase_wallet', 
                'rainbow', 
                'wallet_connect'
              ]
            },
            // Configure to support both EVM and Solana
            embeddedWallets: {
              createOnLogin: 'users-without-wallets'
            },
            // Configure Solana clusters
            solanaClusters: [
              { name: 'mainnet-beta', rpcUrl: 'https://api.mainnet-beta.solana.com' }
            ],
            // Add Solana wallet connectors
            externalWallets: {
              solana: {
                connectors: toSolanaWalletConnectors()
              }
            }
          }}
        >
          {children}
        </PrivyProvider>
      </WagmiProvider>
    </RelayKitProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RelayProviders>
        {children}
      </RelayProviders>
    </QueryClientProvider>
  )
} 
