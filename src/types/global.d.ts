declare module '@reservoir0x/relay-kit-ui' {
  import { FC } from 'react';
  
  export interface SwapWidgetProps {
    fromToken?: any;
    setFromToken?: (token: any) => void;
    toToken?: any;
    setToToken?: (token: any) => void;
    lockFromToken?: boolean;
    lockToToken?: boolean;
    supportedWalletVMs?: string[];
    onConnectWallet?: (type?: string) => Promise<void>;
    defaultToAddress?: `0x${string}`;
    multiWalletSupportEnabled?: boolean;
    onSetPrimaryWallet?: () => void;
    onLinkNewWallet?: () => void;
    linkedWallets?: any[];
    wallet?: any;
    onAnalyticEvent?: (event: any) => void;
    slippageTolerance?: string;
  }

  export const SwapWidget: FC<SwapWidgetProps>;
  export const SlippageToleranceConfig: FC<{
    setSlippageTolerance: (value: string) => void;
    onAnalyticEvent?: (eventName: string, data: any) => void;
  }>;
}

declare module '@reservoir0x/relay-sdk' {
  export function adaptViemWallet(wallet: any): any;
}

declare module '@/utils/solanaAdapter' {
  import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
  
  export interface SolanaWalletInterface {
    publicKey: PublicKey | string;
    signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
    signTransaction?: (transaction: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
    signAllTransactions?: (transactions: (Transaction | VersionedTransaction)[]) => Promise<(Transaction | VersionedTransaction)[]>;
  }
  
  export function adaptSolanaWallet(wallet: SolanaWalletInterface): Promise<any>;
}

declare module '@/utils/bridge' {
  export const SUPPORTED_CHAINS: {
    ETHEREUM: number;
    POLYGON: number;
    BASE: number;
  };
}

declare module '@/utils/paycrest' {
  export function getRatesForOfframp(): Promise<{ NGN: number }>;
}

declare module '@/styles/relay-overrides.css';

declare module '@privy-io/react-auth' {
  export interface PrivyWallet {
    id?: string;
    address: string;
    chainType?: string;
    walletClientType?: string;
    connectorType?: string;
  }

  export interface PrivyUser {
    id: string;
    createdAt: Date;
    linkedAccounts: any[];
    email?: string;
    phone?: string;
    wallet?: PrivyWallet;
    [key: string]: any;
  }

  export interface UsePrivyReturn {
    ready: boolean;
    authenticated: boolean;
    user: PrivyUser | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    linkWallet: () => Promise<void>;
  }

  export function usePrivy(): UsePrivyReturn;
} 