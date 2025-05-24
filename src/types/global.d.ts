// Global type definitions for the application
// This file doesn't need to be imported - TypeScript will pick it up automatically

export {}; // This file needs to be a module

declare global {
  interface Window {
    walletConnectInitialized?: boolean;
  }
} 