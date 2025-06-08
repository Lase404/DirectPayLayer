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
import {
  LogLevel,
  getClient,
  type AdaptedWallet,
  type TransactionStepItem
} from '@reservoir0x/relay-sdk'

// Constants for Solana chain IDs
const SOLANA_CHAIN_ID = 792703809; // Relay's Solana chain ID
const SOLANA_MAINNET_CHAIN_ID = 1399811149; // Standard Solana mainnet chain ID

// Define the interface for the Solana wallet adapter
export interface SolanaWalletInterface {
  publicKey: string;
  signTransaction: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  signAllTransactions: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  sendTransaction?: (transaction: Transaction | VersionedTransaction, connection: Connection) => Promise<{ signature: string }>;
}

// Constants for RPC configuration
const QUICKNODE_URL = 'https://frequent-indulgent-theorem.solana-mainnet.quiknode.pro/288c090b70deb85f86ba0f2feaad99f9e56e7c2d/'

// Enhanced adapter for Solana wallets
export const adaptSolanaWallet = async (wallet: SolanaWalletInterface): Promise<AdaptedWallet> => {
  console.log('Initializing Solana wallet adapter...')
  
  // Create Solana connection with proper configuration
  const connection = new Connection(QUICKNODE_URL, {
    commitment: 'confirmed',
    httpHeaders: {
      'Content-Type': 'application/json',
    },
    confirmTransactionInitialTimeout: 60000, // 60 seconds
  });
  
  // Test the connection
  try {
    const version = await connection.getVersion();
    console.log('Successfully connected to Solana network:', version);
    
    // Additional connection test
    const slot = await connection.getSlot();
    console.log('Current slot:', slot);
  } catch (err) {
    console.error('Failed to connect to Solana network:', err);
    throw new Error(`Failed to establish Solana connection: ${err instanceof Error ? err.message : String(err)}`);
  }
  
  // Create a function to sign and send transactions
  const signAndSendTransaction = async (
    transaction: VersionedTransaction,
    options?: SendOptions,
    instructions?: TransactionInstruction[],
    rawInstructions?: TransactionStepItem['data']['instructions']
  ): Promise<{ signature: TransactionSignature }> => {
    console.log('Signing and sending transaction...');
    
    try {
      // Try to use the wallet's native sendTransaction method if available
      if (wallet.sendTransaction) {
        console.log('Using wallet.sendTransaction method...');
        return await wallet.sendTransaction(transaction, connection);
      }
      
      // Fall back to sign-then-send approach
      console.log('Using sign-then-send approach...');
      const signedTx = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(
        (signedTx as VersionedTransaction).serialize(),
        options
      );
      
      console.log('Transaction sent successfully with signature:', signature);
      return { signature };
    } catch (err) {
      console.error('Error in signAndSendTransaction:', err);
      throw new Error(`Failed to sign and send transaction: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  // Use the streamlined implementation
  return adaptSolanaWalletCore(
    wallet.publicKey,
    SOLANA_CHAIN_ID,
    connection,
    signAndSendTransaction
  );
}

// Core adapter implementation based on the provided code
export const adaptSolanaWalletCore = (
  walletAddress: string,
  chainId: number,
  connection: Connection,
  signAndSendTransaction: (
    transaction: VersionedTransaction,
    options?: SendOptions,
    instructions?: TransactionInstruction[],
    rawInstructions?: TransactionStepItem['data']['instructions']
  ) => Promise<{
    signature: TransactionSignature
  }>
): AdaptedWallet => {
  let _chainId = chainId
  const getChainId = async () => {
    console.log(`Getting chain ID: ${_chainId}`);
    return _chainId
  }

  return {
    vmType: 'svm',
    getChainId,
    address: async () => {
      console.log('Getting wallet public key:', walletAddress);
      return walletAddress
    },
    handleSignMessageStep: async () => {
      console.log('Message signing requested but not implemented');
      throw new Error('Message signing not implemented for Solana')
    },
    handleSendTransactionStep: async (_chainId, stepItem) => {
      console.log('Handling send transaction step...');
      const client = getClient()

        const instructions =
          stepItem?.data?.instructions?.map(
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
        ) ?? []

      console.log('Getting latest blockhash...');
      const blockhash = await connection
        .getLatestBlockhash()
        .then((b) => b.blockhash);
      console.log('Blockhash obtained:', blockhash);

      console.log('Creating transaction message...');
        const messageV0 = new TransactionMessage({
        payerKey: new PublicKey(walletAddress),
          instructions,
        recentBlockhash: blockhash
        }).compileToV0Message(
          await Promise.all(
            stepItem?.data?.addressLookupTableAddresses?.map(
            async (address: string) => {
              console.log('Fetching lookup table for address:', address);
              return await connection
                  .getAddressLookupTable(new PublicKey(address))
                  .then((res) => res.value as AddressLookupTableAccount)
            }
            ) ?? []
          )
      )

      console.log('Creating versioned transaction...');
      const transaction = new VersionedTransaction(messageV0)
      
      console.log('Signing and sending transaction...');
      const signature = await signAndSendTransaction(
        transaction,
        undefined,
        instructions,
        stepItem.data.instructions
      )

      console.log('Transaction signature obtained:', signature.signature);
      client.log(
        ['Transaction Signature obtained', signature],
        LogLevel.Verbose
      )

      return signature.signature
    },
    handleConfirmTransactionStep: async (txHash) => {
      console.log('Handling confirm transaction step for hash:', txHash);
      // Solana doesn't have a concept of replaced transactions
      // So we don't need to handle onReplaced and onCancelled

      console.log('Getting latest blockhash for confirmation...');
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed')

      console.log('Confirming transaction...');
      const result = await connection.confirmTransaction({
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
        signature: txHash
      })

      if (result.value.err) {
        console.error('Transaction confirmation failed:', result.value.err);
        throw new Error(`Transaction failed: ${result.value.err}`)
      }

      console.log('Transaction confirmed successfully!');
      return {
        blockHash: result.context.slot.toString(),
        blockNumber: result.context.slot,
        txHash
      }
    },
    switchChain: (chainId: number) => {
      console.log('Chain switch requested to:', chainId);
      // Accept both Relay's Solana chain ID and the standard Solana mainnet chain ID
      const validChainIds = [SOLANA_CHAIN_ID, SOLANA_MAINNET_CHAIN_ID];
      if (!validChainIds.includes(chainId)) {
        console.error('Invalid Solana chain ID:', chainId);
        throw new Error(`Invalid Solana chain ID: ${chainId}`);
      }
      _chainId = chainId
      console.log('Chain ID updated to:', _chainId);
      return new Promise<void>((res) => res())
    }
  }
} 