import { NextResponse } from 'next/server';

const PAYCREST_API_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';
const DEFAULT_ETH_ADDRESS = '0xA110c77FA4b07ab601e63Ecd65E99Ddb8f1df6ec';

// Enhanced helper function to detect Solana addresses
const isSolanaAddress = (address: string): boolean => {
  if (!address || typeof address !== 'string') return false;
  
  // Solana addresses are base58 encoded strings, typically 32-44 characters
  // They don't start with 0x like Ethereum addresses
  const isSolana = !address.startsWith('0x') && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  
  if (isSolana) {
    console.log(`DETECTED SOLANA ADDRESS: ${address}`);
  }
  
  return isSolana;
}

export async function POST(request: Request) {
  try {
    // Track original request details for logging
    let originalReturnAddress = '';
    
    // Parse the request body
    const orderData = await request.json();
    console.log('[paycrest-order] Received order creation request:', JSON.stringify(orderData, null, 2));
    
    // Save original return address for logging
    originalReturnAddress = orderData.returnAddress || '';

    // Check for Solana address and replace if found - STRICT ENFORCEMENT
    if (orderData.returnAddress) {
      if (isSolanaAddress(orderData.returnAddress)) {
        console.log(`[paycrest-order] Replacing Solana address ${orderData.returnAddress} with ${DEFAULT_ETH_ADDRESS}`);
        orderData.returnAddress = DEFAULT_ETH_ADDRESS;
      } else if (!orderData.returnAddress.startsWith('0x')) {
        // If it doesn't start with 0x, it's not a valid Ethereum address either
        console.log(`[paycrest-order] Non-Ethereum address detected ${orderData.returnAddress}, replacing with default`);
        orderData.returnAddress = DEFAULT_ETH_ADDRESS;
      }
    } else {
      // If no return address provided, use the default
      console.log('[paycrest-order] No return address provided, using default');
      orderData.returnAddress = DEFAULT_ETH_ADDRESS;
    }
    
    // FORCE CHECK: Final validation before sending
    const finalAddress = orderData.returnAddress;
    if (!finalAddress || !finalAddress.startsWith('0x') || !(/^0x[a-fA-F0-9]{40}$/.test(finalAddress))) {
      console.log(`[paycrest-order] FINAL CHECK - Invalid Ethereum address, forcing default: ${finalAddress}`);
      orderData.returnAddress = DEFAULT_ETH_ADDRESS;
    }

    // Proxy the request to Paycrest API
    console.log('[paycrest-order] Sending modified order payload to Paycrest:', JSON.stringify(orderData, null, 2));
    
    const response = await fetch(`https://api.paycrest.io/v1/sender/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': PAYCREST_API_KEY
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorText = await response.text();
        errorDetails = errorText;
        console.error(`[paycrest-order] Paycrest API error [${response.status}]:`, errorText);
      } catch (err) {
        console.error('[paycrest-order] Could not read error response');
      }
      
      // Log additional details about the request that failed
      console.error('[paycrest-order] Failed request details:', {
        originalAddress: originalReturnAddress,
        sentAddress: orderData.returnAddress,
        wasSolana: isSolanaAddress(originalReturnAddress),
        statusCode: response.status
      });
      
      return NextResponse.json(
        { 
          status: 'error', 
          message: `Failed to create order: ${response.status}`,
          details: errorDetails
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Log success
    console.log('[paycrest-order] Paycrest order creation successful:', data.data?.id || 'Unknown ID');
    if (originalReturnAddress !== orderData.returnAddress) {
      console.log(`[paycrest-order] Address replacement result: ${originalReturnAddress} → ${orderData.returnAddress}`);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('[paycrest-order] Error in order creation proxy:', error);
    
    return NextResponse.json(
      { status: 'error', message: 'Server error while creating order' },
      { status: 500 }
    );
  }
} 