'use client'

import { MAINNET_RELAY_API } from '@reservoir0x/relay-sdk'
import { formatUnits, parseUnits } from 'ethers'

// Supported chains
export const SUPPORTED_CHAINS = {
  ETHEREUM: 1,
  POLYGON: 137,
  BASE: 8453,
}

// Define types for relay client and wallet client
type RelayClient = any
type WalletClient = any

interface QuoteParams {
  user: string
  originChainId: number
  originCurrency: string
  destinationChainId?: number
  destinationCurrency?: string
  amount: string
  tradeType?: 'EXACT_INPUT' | 'EXPECTED_OUTPUT'
  recipient?: string
}

/**
 * Get bridge quote using Relay SDK 
 * This function uses the relay client's getSwapQuote method 
 * to get a quote for a token swap between chains
 */
export async function getBridgeQuote(
  relayClient: RelayClient, 
  walletClient: WalletClient, 
  {
    user,
    originChainId,
    originCurrency,
    destinationChainId = 8453, // Base (fixed for USDC)
    destinationCurrency = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    amount,
    tradeType = "EXACT_INPUT",
    recipient,
  }: QuoteParams
) {
  if (!relayClient || !amount) return null;

  // Build the quote data
  const quoteData = {
    user: user,
    originChainId,
    originCurrency,
    destinationChainId,
    destinationCurrency,
    tradeType,
    recipient: recipient || user,
    amount,
    usePermit: false,
    useExternalLiquidity: false,
    referrer: "relay.link/bridge",
    refundTo: user
  };

  // Get the quote
  return relayClient.getSwapQuote(quoteData);
}

/**
 * Execute bridge transaction with Relay SDK
 */
export async function executeBridge(
  quoteResponse: any, 
  relayClient: RelayClient, 
  walletClient: WalletClient
) {
  if (!quoteResponse || !relayClient || !walletClient) {
    throw new Error("Missing required parameters for bridge execution");
  }
  
  return relayClient.executeQuote({
    quoteResponse,
    signer: walletClient
  });
}

/**
 * Function to get USDC address for a given chain
 */
export const getUsdcAddress = (chainId: number | string): string => {
  switch (Number(chainId)) {
    case SUPPORTED_CHAINS.ETHEREUM:
      return '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // Ethereum USDC
    case SUPPORTED_CHAINS.POLYGON:
      return '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // Polygon USDC  
    case SUPPORTED_CHAINS.BASE:
      return '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC
    default:
      throw new Error(`USDC address not defined for chain ${chainId}`);
  }
}; 