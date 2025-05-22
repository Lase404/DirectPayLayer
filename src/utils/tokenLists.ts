import axios from 'axios';
import { Chain } from 'wagmi'

export interface Token {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  chainId?: number | string;
  logoURI?: string;
  balance?: string;
  balanceUsd?: string;
  price?: number;
}

// Function to fetch token list (but now with CORS protection)
async function fetchTokenList(url: string): Promise<Token[]> {
  try {
    // Try with a CORS proxy if direct access fails
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (response.data?.tokens) {
      return response.data.tokens;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching token list:', error);
    throw error;
  }
}

// Map of chainId -> tokens
export const DEFAULT_TOKENS: Record<number, Token[]> = {
  // Ethereum (mainnet)
  1: [
    {
      chainId: 1,
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png'
    },
    {
      chainId: 1,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      name: 'Wrapped Ethereum',
      symbol: 'WETH',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/2518/small/weth.png'
    },
    {
      chainId: 1,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png'
    },
    {
      chainId: 1,
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png'
    },
    {
      chainId: 1,
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      name: 'Dai Stablecoin',
      symbol: 'DAI',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/9956/small/4943.png'
    },
    {
      chainId: 1,
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      name: 'Wrapped Bitcoin',
      symbol: 'WBTC',
      decimals: 8,
      logoURI: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png'
    }
  ],
  
  // Polygon
  137: [
    {
      chainId: 137,
      address: '0x0000000000000000000000000000000000001010',
      name: 'Polygon',
      symbol: 'MATIC',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png'
    },
    {
      chainId: 137,
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      name: 'Wrapped Ethereum',
      symbol: 'WETH',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/2518/small/weth.png'
    },
    {
      chainId: 137,
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png'
    },
    {
      chainId: 137,
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      name: 'Tether USD',
      symbol: 'USDT',
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether-logo.png'
    },
    {
      chainId: 137,
      address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
      name: 'Dai Stablecoin',
      symbol: 'DAI',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/9956/small/4943.png'
    },
    {
      chainId: 137,
      address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
      name: 'Wrapped Bitcoin',
      symbol: 'WBTC',
      decimals: 8,
      logoURI: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png'
    }
  ],
  
  // Base Chain
  8453: [
    {
      chainId: 8453,
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png'
    },
    {
      chainId: 8453,
      address: '0x4200000000000000000000000000000000000006',
      name: 'Wrapped Ethereum',
      symbol: 'WETH',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/2518/small/weth.png'
    },
    {
      chainId: 8453,
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png'
    },
    {
      chainId: 8453,
      address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      name: 'USD Coin',
      symbol: 'USDbC',
      decimals: 6,
      logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png'
    },
    {
      chainId: 8453,
      address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      name: 'Dai Stablecoin',
      symbol: 'DAI',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/9956/small/4943.png'
    },
    {
      chainId: 8453,
      address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
      name: 'Coinbase Wrapped Staked ETH',
      symbol: 'cbETH',
      decimals: 18,
      logoURI: 'https://assets.coingecko.com/coins/images/27008/small/cbeth.png'
    }
  ]
}

// Return tokens for a specific chain, or empty array if chain not found
export const getTokensForChain = (chainId: number): Token[] => {
  return DEFAULT_TOKENS[chainId] || []
}

// Get tokens for Solana
export async function getSolanaTokens(): Promise<Token[]> {
  return DEFAULT_TOKENS.solana || [];
}

// Enhanced function to get tokens for a specific chain
export async function getTokensForChainEnhanced(chainId: number): Promise<Token[]> {
  // Using default tokens for reliability
  console.log(`Returning default tokens for chain ${chainId}`);
  return Promise.resolve(DEFAULT_TOKENS[chainId] || []);
  
  // The code below is commented out due to CORS issues
  /*
  try {
    // Use appropriate token list URL based on the chain
    let url = '';
    
    switch (chainId) {
      case 1: // Ethereum
        url = 'https://tokens.uniswap.org';
        break;
      case 8453: // Base
        url = 'https://raw.githubusercontent.com/base-org/token-list/main/lists/base.tokenlist.json';
        break;
      default:
        return DEFAULT_TOKENS[chainId] || [];
    }
    
    const tokens = await fetchTokenList(url);
    
    // Filter tokens for the specified chainId
    return tokens
      .filter(token => token.chainId === chainId)
      .map(token => ({
        name: token.name,
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
        logoURI: token.logoURI,
        chainId: token.chainId,
      }));
  } catch (error) {
    console.error(`Error fetching tokens for chain ${chainId}:`, error);
    return DEFAULT_TOKENS[chainId] || [];
  }
  */
}

// Default tokens if API fails
export const DEFAULT_TOKENS_STRING: Record<string, Token[]> = {
  'solana': [
    { symbol: 'SOL', name: 'Solana', address: 'native', decimals: 9, chainId: 'solana' as any, logoURI: '/images/sol.png' },
    { symbol: 'USDC', name: 'USD Coin', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, chainId: 'solana' as any, logoURI: '/images/usdc.png' },
  ],
}; 