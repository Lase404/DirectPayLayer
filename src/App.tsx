import { RelayKitProvider } from '@reservoir0x/relay-kit-ui'
import { convertViemChainToRelayChain, MAINNET_RELAY_API } from '@reservoir0x/relay-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, createConfig, WagmiProvider } from '@wagmi/core'
import { mainnet } from '@wagmi/core/chains'
import '@reservoir0x/relay-kit-ui/styles.css'
import { SwapWidgetWrapper } from './components/SwapWidgetWrapper'

const queryClient = new QueryClient()

const chains = [convertViemChainToRelayChain(mainnet)]

const wagmiConfig = createConfig({
  appName: 'DirectPay',
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(),
  }
})

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <RelayKitProvider 
        options={{
          appName: 'DirectPay',
          chains,
          baseApiUrl: MAINNET_RELAY_API,
          duneConfig: {
            apiKey: "SWDwVHIY3Y8S4rWu8XIPV6CcHI1q4hh5",
            apiBaseUrl: "https://api.dune.com/api/v1"
          },
          disablePoweredByReservoir: true,
          appFees: [
            {
              recipient: '0x0000000000000000000000000000000000000000',
              fee: '100' // 1%
            }
          ]
        }}
      >
        <WagmiProvider config={wagmiConfig}>
          <SwapWidgetWrapper />
        </WagmiProvider>
      </RelayKitProvider>
    </QueryClientProvider>
  )
}

export default App 