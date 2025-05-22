import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  Transaction,
  type SendOptions,
  type TransactionSignature
} from '@solana/web3.js'

// Define the interface for the Solana wallet adapter
export interface SolanaWalletInterface {
  publicKey: string;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction?: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  signAllTransactions?: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>;
  sendTransaction?: (transaction: Transaction | VersionedTransaction, connection: Connection) => Promise<TransactionSignature>;
}

// Enhanced adapter for Privy Solana wallets
export const adaptSolanaWallet = (wallet: SolanaWalletInterface) => {
  let _chainId = 0; // Default to Solana mainnet-beta in Reservoir

  const getChainId = async () => {
    return _chainId;
  };

  return {
    vmType: 'svm',
    getChainId,
    address: async () => {
      return wallet.publicKey;
    },
    handleSignMessageStep: async (message: Uint8Array) => {
      if (!wallet.signMessage) {
        throw new Error('Message signing not implemented for this Solana wallet');
      }
      
      console.log('Signing Solana message', message);
      
      try {
        const signature = await wallet.signMessage(message);
        return signature;
      } catch (error) {
        console.error('Error signing message with Solana wallet', error);
        throw error;
      }
    },
    handleSendTransactionStep: async (_chainId, stepItem) => {
      console.log('Processing Solana transaction', stepItem);

      if (!wallet.sendTransaction) {
        throw new Error('Transaction sending not implemented for this Solana wallet');
      }

      try {
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
          ) ?? [];

        // Create a connection instance
        const connection = new Connection(
          'https://api.mainnet-beta.solana.com', 
          'confirmed'
        );

        const messageV0 = new TransactionMessage({
          payerKey: new PublicKey(wallet.publicKey),
          instructions,
          recentBlockhash: await connection
            .getLatestBlockhash()
            .then((b) => b.blockhash)
        }).compileToV0Message(
          await Promise.all(
            stepItem?.data?.addressLookupTableAddresses?.map(
              async (address: string) =>
                await connection
                  .getAddressLookupTable(new PublicKey(address))
                  .then((res) => res.value as AddressLookupTableAccount)
            ) ?? []
          )
        );

        const transaction = new VersionedTransaction(messageV0);
        
        // If wallet requires signing first
        if (wallet.signTransaction) {
          const signedTx = await wallet.signTransaction(transaction);
          const signature = await wallet.sendTransaction(signedTx, connection);
          console.log('Transaction Signature obtained', signature);
          return signature;
        } else {
          // Directly send if wallet handles signing internally
          const signature = await wallet.sendTransaction(transaction, connection);
          console.log('Transaction Signature obtained', signature);
          return signature;
        }
      } catch (error) {
        console.error('Error processing Solana transaction', error);
        throw error;
      }
    },
    handleConfirmTransactionStep: async (txHash, _connection) => {
      // Create a connection instance if not provided
      const connection = _connection || new Connection(
        'https://api.mainnet-beta.solana.com', 
        'confirmed'
      );

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed');

      const result = await connection.confirmTransaction({
        blockhash: blockhash,
        lastValidBlockHeight: lastValidBlockHeight,
        signature: txHash
      });

      if (result.value.err) {
        throw new Error(`Transaction failed: ${result.value.err}`);
      }

      return {
        blockHash: result.context.slot.toString(),
        blockNumber: result.context.slot,
        txHash
      };
    },
    switchChain: (chainId: number) => {
      _chainId = chainId;
      return Promise.resolve();
    }
  };
}; 