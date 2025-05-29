import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type SendOptions,
  type TransactionSignature
} from '@solana/web3.js'
import { LogLevel, getClient, type AdaptedWallet, type SignatureStepItem } from '@reservoir0x/relay-sdk'

// Constants for RPC configuration
const SOLANA_RPC_URL = 'https://frequent-indulgent-theorem.solana-mainnet.quiknode.pro/288c090b70deb85f86ba0f2feaad99f9e56e7c2d/'
const MAX_RETRIES = 3
const INITIAL_BACKOFF = 1000 // 1 second

// Helper function to wait with exponential backoff
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Helper function to get blockhash with retries
async function getBlockhashWithRetry(connection: Connection, retries = MAX_RETRIES, backoff = INITIAL_BACKOFF): Promise<string> {
  try {
    const { blockhash } = await connection.getLatestBlockhash('confirmed')
    return blockhash
  } catch (error) {
    if (retries <= 0) {
      throw new Error('Failed to get blockhash after multiple attempts')
    }
    
    console.warn(`Failed to get blockhash, retries left: ${retries}`, error)
    await wait(backoff)
    
    // Retry with exponential backoff
    return getBlockhashWithRetry(connection, retries - 1, backoff * 2)
  }
}

// Define the interface for the Solana wallet adapter
export interface SolanaWalletInterface {
  publicKey: string;
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  signAllTransactions: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  sendTransaction?: (transaction: Transaction | VersionedTransaction, connection: Connection) => Promise<{ signature: string }>;
}

// Enhanced adapter for Solana wallets
export const adaptSolanaWallet = async (wallet: SolanaWalletInterface): Promise<AdaptedWallet> => {
  // Create Solana connection with commitment level and custom headers
  const connection = new Connection(SOLANA_RPC_URL, {
    commitment: 'confirmed',
    httpHeaders: {
      'Content-Type': 'application/json',
      'User-Agent': 'DirectPay/1.0.0',
      // Add any additional QuickNode specific headers if needed
    },
    wsEndpoint: SOLANA_RPC_URL.replace('https://', 'wss://'), // WebSocket endpoint for better performance
    confirmTransactionInitialTimeout: 60000, // 60 seconds
  });
  
  // Test the connection
  try {
    const version = await connection.getVersion();
    console.log('Connected to Solana network:', version);
  } catch (err) {
    console.error('Failed to connect to Solana network:', err);
    throw new Error('Failed to establish Solana connection');
  }

  const getChainId = async () => {
    return 1399811149 // Solana mainnet chain ID
  }

  return {
    vmType: 'svm',
    getChainId,
    address: async () => {
      return wallet.publicKey
    },
    handleSignMessageStep: async (item: SignatureStepItem) => {
      try {
        if (!item.data?.sign?.message) {
          throw new Error('No message provided for signing')
        }
        const messageBytes = Buffer.from(item.data.sign.message)
        const signature = await wallet.signMessage(messageBytes)
        return Buffer.from(signature).toString('hex')
      } catch (err: any) {
        console.error('Error signing message:', err)
        throw new Error(`Failed to sign message with Solana wallet: ${err.message || 'Unknown error'}`)
      }
    },
    handleSendTransactionStep: async (_chainId, stepItem) => {
      const client = getClient()

      try {
        if (!stepItem?.data?.instructions) {
          throw new Error('No instructions provided for transaction')
        }

        const instructions = stepItem.data.instructions.map(
          (i) =>
            new TransactionInstruction({
              keys: i.keys.map((k) => ({
                isSigner: k.isSigner,
                isWritable: k.isWritable,
                pubkey: new PublicKey(k.pubkey)
              })),
              programId: new PublicKey(i.programId),
              data: Buffer.from(i.data, 'hex')
            })
        )

        // Get blockhash with retry mechanism
        const blockhash = await getBlockhashWithRetry(connection)

        // Create transaction message
        const messageV0 = new TransactionMessage({
          payerKey: new PublicKey(wallet.publicKey),
          instructions,
          recentBlockhash: blockhash
        }).compileToV0Message(
          await Promise.all(
            stepItem.data.addressLookupTableAddresses?.map(
              async (address: string) => {
                try {
                  const response = await connection.getAddressLookupTable(new PublicKey(address))
                  if (!response.value) {
                    throw new Error(`No lookup table found for address: ${address}`)
                  }
                  return response.value as AddressLookupTableAccount
                } catch (err: any) {
                  console.error(`Error fetching lookup table for ${address}:`, err)
                  throw new Error(`Failed to fetch lookup table: ${err.message || 'Unknown error'}`)
                }
              }
            ) ?? []
          )
        )

        // Create and sign transaction
        const transaction = new VersionedTransaction(messageV0)
        
        let signature: string
        try {
          // Try to use wallet's send if available
          if (wallet.sendTransaction) {
            const result = await wallet.sendTransaction(transaction, connection)
            signature = result.signature
          } else {
            // Sign the transaction
            const signedTx = await wallet.signTransaction(transaction)
            // Send the signed transaction
            signature = await connection.sendRawTransaction((signedTx as VersionedTransaction).serialize())
          }
          
          client.log(['Transaction signature obtained:', signature], LogLevel.Verbose)
          return signature
          
        } catch (err: any) {
          console.error('Error sending transaction:', err)
          throw new Error(`Transaction send failed: ${err.message || 'Unknown error'}`)
        }

      } catch (err: any) {
        console.error('Error in handleSendTransactionStep:', err)
        throw new Error(`Failed to send Solana transaction: ${err.message || 'Unknown error'}`)
      }
    },
    handleConfirmTransactionStep: async (txHash) => {
      try {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

        const result = await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature: txHash
        }, 'confirmed')

        if (result.value.err) {
          throw new Error(`Transaction failed: ${result.value.err}`)
        }

        return {
          blockHash: result.context.slot.toString(),
          blockNumber: result.context.slot,
          txHash
        }
      } catch (err: any) {
        console.error('Error confirming transaction:', err)
        throw new Error(`Failed to confirm Solana transaction: ${err.message || 'Unknown error'}`)
      }
    },
    switchChain: async (chainId: number) => {
      // Solana doesn't need chain switching, but we'll validate the chain ID
      if (chainId !== 1399811149) {
        throw new Error('Invalid Solana chain ID')
      }
    }
  }
} 