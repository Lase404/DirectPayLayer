import { useQuery } from '@tanstack/react-query'
import { Chain } from 'viem'
import { mainnet } from 'viem/chains'
import { configureDynamicChains, RelayChain } from '@reservoir0x/relay-sdk'

interface ChainsQuery {
  baseApiUrl: string
}

interface ChainsResponse {
  chains: RelayChain[]
}

async function queryRelayChains({ baseApiUrl }: ChainsQuery): Promise<ChainsResponse> {
  try {
    const chains = await configureDynamicChains()
    return { chains }
  } catch (error) {
    console.error('Error fetching relay chains:', error)
    return { chains: [] }
  }
}

export function useRelayChains(baseApiUrl: string) {
  const { data } = useQuery({
    queryKey: ['relayChains', baseApiUrl],
    queryFn: () => queryRelayChains({ baseApiUrl }),
    staleTime: Infinity,
  })

  const chains = data?.chains || []
  const viemChains = chains.length > 0 
    ? chains.map(chain => ({
        ...chain.viemChain,
        id: chain.id
      })) as Chain[]
    : [mainnet]

  return {
    chains,
    viemChains,
  }
}