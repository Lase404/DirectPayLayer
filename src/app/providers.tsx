'use client'

import { createClient, MAINNET_RELAY_API } from '@reservoir0x/relay-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet } from 'viem/chains'
import '@reservoir0x/relay-kit-ui/styles.css'
import { useState, useEffect } from 'react'
import type { Chain } from 'viem'
import { PrivyProvider } from '@privy-io/react-auth'
import { useRelayChains } from '@/hooks/useRelayChains'

// Create query client
const queryClient = new QueryClient()

// Initialize the Relay SDK client
createClient({
  baseApiUrl: MAINNET_RELAY_API,
  source: 'naira-bridge',
})

// Create wagmi config
const wagmiConfig = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(),
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''}
          config={{
            loginMethods: ['wallet', 'email'],
            appearance: {
              theme: 'light',
              accentColor: '#676FFF',
            },
            embeddedWallets: {
              createOnLogin: 'all-users',
            },
          }}
        >
          {children}
        </PrivyProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}
