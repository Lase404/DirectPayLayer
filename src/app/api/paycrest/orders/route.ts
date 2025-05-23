import { NextResponse } from 'next/server';

const PAYCREST_API_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';
const DEFAULT_ETH_ADDRESS = '0xA110c77FA4b07ab601e63Ecd65E99Ddb8f1df6ec';

// Helper function to detect Solana addresses
const isSolanaAddress = (address: string): boolean => {
  // Solana addresses are base58 encoded strings, typically 32-44 characters
  // They don't start with 0x like Ethereum addresses
  return typeof address === 'string' && 
         !address.startsWith('0x') && 
         /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export async function POST(request: Request) {
  try {
    // Track original request details for logging
    let originalReturnAddress = '';
    
    // Parse the request body
    const orderData = await request.json();
    console.log('Received order creation request:', JSON.stringify(orderData, null, 2));
    
    // Save original return address for logging
    originalReturnAddress = orderData.returnAddress || '';

    // Check for Solana address and replace if found
    if (orderData.returnAddress && isSolanaAddress(orderData.returnAddress)) {
      console.log(`API proxy: Detected Solana address ${orderData.returnAddress}`);
      orderData.returnAddress = DEFAULT_ETH_ADDRESS;
      console.log(`API proxy: Replaced with Ethereum address ${DEFAULT_ETH_ADDRESS}`);
    }

    // Proxy the request to Paycrest API
    console.log('Sending modified order payload to Paycrest:', JSON.stringify(orderData, null, 2));
    
    const response = await fetch(`https://api.paycrest.io/v1/sender/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': PAYCREST_API_KEY
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Paycrest API error [${response.status}]:`, errorText);
      
      // Log additional details about the request that failed
      console.error('Failed request details:', {
        originalAddress: originalReturnAddress,
        sentAddress: orderData.returnAddress,
        wasSolana: isSolanaAddress(originalReturnAddress),
        statusCode: response.status
      });
      
      return NextResponse.json(
        { 
          status: 'error', 
          message: `Failed to create order: ${response.status}`,
          details: errorText
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Log success
    console.log('Paycrest order creation successful:', data.data?.id || 'Unknown ID');
    if (originalReturnAddress !== orderData.returnAddress) {
      console.log(`Address replacement result: ${originalReturnAddress} → ${orderData.returnAddress}`);
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in order creation proxy:', error);
    
    return NextResponse.json(
      { status: 'error', message: 'Server error while creating order' },
      { status: 500 }
    );
  }
} 