'use client'

import { useState, useEffect } from 'react';

/**
 * WalletInitializer Component
 * 
 * This component manages the global WalletConnect initialization state
 * to prevent multiple initializations across the application.
 * 
 * Place this component at the root level of your application.
 */
export default function WalletInitializer() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Set up the global initialization flag if not already set
    if (typeof window !== 'undefined') {
      // Only set the flag if it doesn't exist
      if (window.walletConnectInitialized === undefined) {
        console.log("Setting up global WalletConnect initialization tracker");
        window.walletConnectInitialized = false;
      }
      
      // Listen for web3modal events to track initialization state
      const handleWalletConnectInit = () => {
        console.log("WalletConnect initialized via event detection");
        window.walletConnectInitialized = true;
        setInitialized(true);
      };
      
      // Try to detect WalletConnect initialization through various means
      // Web3Modal events
      window.addEventListener('web3modal.init', handleWalletConnectInit);
      window.addEventListener('walletconnect.init', handleWalletConnectInit);
      
      // Check for existing instances periodically
      const checkInterval = setInterval(() => {
        // Look for common signs of WalletConnect in localStorage
        const hasWalletConnectSession = 
          Object.keys(localStorage).some(key => 
            key.toLowerCase().includes('walletconnect') || 
            key.toLowerCase().includes('web3modal')
          );
        
        if (hasWalletConnectSession && !window.walletConnectInitialized) {
          console.log("Detected WalletConnect session in localStorage");
          window.walletConnectInitialized = true;
          setInitialized(true);
        }
      }, 2000);
      
      return () => {
        window.removeEventListener('web3modal.init', handleWalletConnectInit);
        window.removeEventListener('walletconnect.init', handleWalletConnectInit);
        clearInterval(checkInterval);
      };
    }
  }, []);

  // This component doesn't render anything visible
  return null;
} 