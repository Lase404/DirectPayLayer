'use client'

import { useState, useEffect } from 'react'
import { useWalletClient } from 'wagmi'
import { Card } from './Card'
import { Input } from './Input'
import { Button } from './Button'
import { ConnectWallet } from './ConnectWallet'
import { TokenSearch } from './TokenSearch'
import { ChainSelector } from './ChainSelector'
import { SUPPORTED_CHAINS, getUsdcAddress } from '@/utils/bridge'
import { getRatesForOfframp } from '@/utils/paycrest'
import { formatCrypto, formatNaira, formatNumber } from '@/utils/format'
import { parseUnits, formatUnits } from 'ethers'
import { useRelayClient } from '@reservoir0x/relay-kit-ui'
import { useQuote } from '@reservoir0x/relay-kit-hooks'
import { useAuth } from '@/contexts/CivicAuthContext'
import { usePrivy } from '@privy-io/react'

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

export function BridgeForm() {
  const { authenticated, user } = usePrivy()
  const address = user?.wallet?.address
  const isConnected = authenticated
  const { data: walletClient } = useWalletClient()
  const relayClient = useRelayClient()

  const [sourceChainId, setSourceChainId] = useState<number>(SUPPORTED_CHAINS.ETHEREUM)
  const [selectedToken, setSelectedToken] = useState<Token | null>(null)
  const [amount, setAmount] = useState('')
  const [quoteData, setQuoteData] = useState<any>(null)
  const [ngnRate, setNgnRate] = useState<number>(1601.02)
  const [activeView, setActiveView] = useState<'form' | 'review' | 'success'>('form')
  const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [isReviewing, setIsReviewing] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: quoteResponse, isLoading: isQuoteLoading } = useQuote(
    relayClient ?? undefined,
    walletClient,
    quoteData,
    undefined,
    undefined,
    { enabled: quoteData !== undefined && relayClient !== undefined }
  )

  useEffect(() => {
    if (!address || !amount || !selectedToken || !relayClient || parseFloat(amount) <= 0) {
      setQuoteData(null)
      return
    }
    try {
      const parsedAmount = parseUnits(amount, selectedToken.decimals).toString()
      setQuoteData({
        user: address,
        originChainId: sourceChainId,
        originCurrency: selectedToken.address,
        destinationChainId: SUPPORTED_CHAINS.BASE,
        destinationCurrency: getUsdcAddress(SUPPORTED_CHAINS.BASE),
        tradeType: 'EXACT_INPUT',
        recipient: address,
        amount: parsedAmount,
        usePermit: false,
        useExternalLiquidity: false,
        referrer: 'directpay/bridge',
        refundTo: address
      })
    } catch (error) {
      console.error('Error setting quote data:', error)
      setErrorMessage('Invalid amount format')
    }
  }, [address, amount, selectedToken, sourceChainId, relayClient])

  useEffect(() => {
    async function fetchNgnRate() {
      try {
        const rate = await getRatesForOfframp()
        if (rate && typeof rate.NGN === 'number') {
          setNgnRate(rate.NGN)
        }
      } catch (error) {
        console.error('Error fetching NGN rate:', error)
      }
    }
    fetchNgnRate()
  }, [])

  const destinationAmount = quoteResponse?.details?.currencyOut?.amountFormatted
  const usdValue = quoteResponse?.details?.currencyOut?.amountUsd
  const ngnAmount = usdValue ? parseFloat(usdValue) * ngnRate : 0
  const fees = quoteResponse?.fees
  const swapImpact = quoteResponse?.details?.swapImpact
  const timeEstimate = quoteResponse?.details?.timeEstimate || '5-20 min'
  const rate = quoteResponse?.details?.rate

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9.]/g, '')
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value)
    }
  }

  const handleReview = () => {
    if (!isConnected || !quoteResponse) return
    setIsReviewing(true)
  }

  const handleGoBack = () => {
    setIsReviewing(false)
  }

  const handleExecuteBridge = async () => {
    if (!quoteResponse || !relayClient || !walletClient) {
      setErrorMessage('Cannot execute bridge: missing required data')
      return
    }
    try {
      setTxStatus('pending')
      // @ts-ignore - The execute method exists on the client but TypeScript doesn't recognize it
      const result = await relayClient.execute({
        quoteResponse,
        signer: walletClient
      })
      setTxHash(result.hash)
      setTxStatus('success')
      setActiveView('success')
    } catch (error) {
      console.error('Bridge execution error:', error)
      setErrorMessage('Failed to execute bridge transaction')
      setTxStatus('error')
    }
  }

  if (!isConnected) {
    return (
      <Card className="w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-center mb-6">DirectPay Bridge</h2>
        <p className="text-gray-600 mb-6 text-center">
          Connect your wallet to start bridging tokens to Naira
        </p>
        <div className="flex justify-center">
          <ConnectWallet />
        </div>
      </Card>
    )
  }

  if (activeView === 'success') {
    return (
      <Card className="w-full max-w-md p-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Transaction Successful!</h2>
          <p className="text-gray-600 mb-4">
            Your bridge transaction has been submitted successfully.
          </p>
          {txHash && (
            <div className="mb-4">
              <p className="text-sm text-gray-500 mb-1">Transaction Hash:</p>
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline break-all"
              >
                {txHash}
              </a>
            </div>
          )}
          <p className="text-sm text-gray-600 mb-6">
            Your {formatNaira(ngnAmount)} will be sent to your bank account shortly.
          </p>
          <Button
            onClick={() => {
              setActiveView('form')
              setIsReviewing(false)
              setAmount('')
              setSelectedToken(null)
              setTxHash(null)
              setTxStatus('idle')
            }}
            className="w-full"
          >
            Start New Bridge
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <div className="p-6">
        <h2 className="text-xl font-bold mb-6">
          {isReviewing ? 'Review Bridge' : 'Bridge to Naira'}
        </h2>
        {!isReviewing ? (
          <>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Chain
              </label>
              <ChainSelector
                selectedChainId={sourceChainId}
                onChange={(chainId: number) => setSourceChainId(chainId)}
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Token
              </label>
              <TokenSearch
                chainId={sourceChainId}
                selectedToken={selectedToken}
                onSelectToken={setSelectedToken}
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount
              </label>
              <Input
                value={amount}
                onChange={handleAmountChange}
                placeholder="0.0"
                className="w-full"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => {
                    if (selectedToken?.balance) setAmount(selectedToken.balance)
                  }}
                  className="px-2 py-1 text-xs font-medium text-primary-600 rounded"
                >
                  MAX
                </button>
              </div>
              {selectedToken && amount && parseFloat(amount) > 0 && (
                <div className="mt-2 text-sm">
                  {usdValue && (
                    <div className="flex justify-between text-gray-500">
                      <span>USD Value:</span>
                      <span>${formatNumber(usdValue)}</span>
                    </div>
                  )}
                  {ngnAmount > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>NGN Value:</span>
                      <span>{formatNaira(ngnAmount)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
                {errorMessage}
              </div>
            )}
            <Button
              onClick={handleReview}
              className="w-full"
              disabled={!selectedToken || !amount || parseFloat(amount) <= 0 || isQuoteLoading || !quoteResponse}
              isLoading={isQuoteLoading}
            >
              {isQuoteLoading ? 'Getting Quote...' : 'Continue'}
            </Button>
          </>
        ) : (
          <>
            <div className="mb-4 border border-gray-200 rounded-md p-4">
              <h3 className="font-medium mb-2">Transaction Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-500">From:</div>
                <div className="text-right font-medium">
                  {amount} {selectedToken?.symbol || ''}
                </div>
                <div className="text-gray-500">To:</div>
                <div className="text-right font-medium">
                  {destinationAmount} USDC on Base
                </div>
                <div className="text-gray-500">Rate:</div>
                <div className="text-right">
                  1 {selectedToken?.symbol || ''} = {rate ? formatNumber(parseFloat(rate) * Math.pow(10, 18)) : '0'} USDC
                </div>
                <div className="text-gray-500">Naira Amount:</div>
                <div className="text-right font-medium">
                  {formatNaira(ngnAmount)}
                </div>
                <div className="text-gray-500">Gas Fee:</div>
                <div className="text-right">
                  {fees?.gas?.amount ? formatCrypto(formatUnits(fees.gas.amount.toString(), 18), 'ETH') : '~0.0003 ETH'}
                </div>
                <div className="text-gray-500">Bridge Fee:</div>
                <div className="text-right">
                  {fees?.relayer?.amount ? formatCrypto(formatUnits(fees.relayer.amount.toString(), 6), 'USDC') : '~0.05 USDC'}
                </div>
                <div className="text-gray-500">Price Impact:</div>
                <div className="text-right">
                  {swapImpact?.percent ? swapImpact.percent + '%' : '<1%'}
                </div>
                <div className="text-gray-500">Time Estimate:</div>
                <div className="text-right">
                  {timeEstimate}
                </div>
              </div>
            </div>
            {txStatus === 'pending' && (
              <div className="mb-4 p-3 bg-yellow-50 text-yellow-700 rounded-md text-sm flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-yellow-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Transaction in progress...
              </div>
            )}
            {txStatus === 'error' && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
                {errorMessage || 'Transaction failed. Please try again.'}
              </div>
            )}
            <div className="flex space-x-4">
              <Button
                onClick={handleGoBack}
                variant="outline"
                className="flex-1"
                disabled={txStatus === 'pending'}
              >
                Back
              </Button>
              <Button
                onClick={handleExecuteBridge}
                className="flex-1"
                disabled={txStatus === 'pending'}
                isLoading={txStatus === 'pending'}
              >
                Confirm Bridge
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}