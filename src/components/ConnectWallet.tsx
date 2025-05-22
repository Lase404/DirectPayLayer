'use client'

import { usePrivy } from '@privy-io/react-auth'
import { Button } from './Button'
import { truncateAddress } from '@/utils/format'

export const ConnectWallet = () => {
  const { login, logout, authenticated, user } = usePrivy()
  
  // Show wallet address if available
  const displayName = user?.wallet?.address 
    ? truncateAddress(user.wallet.address) 
    : 'Connected'

  if (authenticated) {
    return (
      <Button
        variant="secondary"
        onClick={() => logout()}
      >
        {displayName}
      </Button>
    )
  }

  return (
    <Button onClick={() => login()}>
      Connect Wallet
    </Button>
  )
} 