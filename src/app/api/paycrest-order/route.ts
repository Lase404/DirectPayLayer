import { NextRequest, NextResponse } from 'next/server';
import { generateHmacSignature } from '@/utils/hmac';


const PUBLIC_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';
const PRIVATE_KEY = 'w7Nrej-opuRPXbuEmDoYRQ04msZCvE1yBnebcAx34ck=';



// Default EVM address to use when a Solana address is detected
const DEFAULT_DESTINATION_ADDRESS = '0x1a84de15BD8443d07ED975a25887Fc4E6779DfaF';

// Helper function to detect Solana addresses
const isSolanaAddress = (address: string): boolean => {
  // Handle null/undefined addresses
  if (!address) return false;
  
  // Solana addresses are base58 encoded strings, typically 32-44 characters
  // They don't start with 0x like Ethereum addresses
  return typeof address === 'string' && 
         !address.startsWith('0x') && 
         /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

// Helper function to ensure valid return address
const getValidReturnAddress = (address: string): string => {
  if (!address) return DEFAULT_DESTINATION_ADDRESS;
  
  if (isSolanaAddress(address)) {
    console.log('API route: Solana address detected, replacing with default destination:', address);
    return DEFAULT_DESTINATION_ADDRESS;
  }
  
  // Verify it's an EVM address format
  if (!address.startsWith('0x') || address.length !== 42) {
    console.warn(`API route: Non-standard address format detected: ${address}, using default`);
    return DEFAULT_DESTINATION_ADDRESS;
  }
  
  return address;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // VALIDATE AND CORRECT RETURN ADDRESS
    if (body.returnAddress) {
      const originalAddress = body.returnAddress;
      body.returnAddress = getValidReturnAddress(body.returnAddress);
      
      if (originalAddress !== body.returnAddress) {
        console.log(`API route: Replaced invalid return address: ${originalAddress} → ${body.returnAddress}`);
      }
    }
    
    // Add timestamp to the payload
    const payloadWithTimestamp = {
      ...body,
      timestamp: Math.floor(Date.now() / 1000) // Unix timestamp in seconds
    };
    
    const stringifiedBody = JSON.stringify(payloadWithTimestamp);
    
    // Generate HMAC signature
    const signature = generateHmacSignature(stringifiedBody, PRIVATE_KEY);
    const authHeader = `HMAC ${PUBLIC_KEY}:${signature}`;

    console.log('Sending validated Paycrest order payload:', {
      ...payloadWithTimestamp,
      returnAddress: payloadWithTimestamp.returnAddress // Log the final address being sent
    });

    const paycrestRes = await fetch('https://api.paycrest.io/v1/sender/orders/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': '7f7d8575-be32-4598-b6a2-43801fe173dc',
      },
      body: stringifiedBody,
    });

    const data = await paycrestRes.json();
    return NextResponse.json(data, { status: paycrestRes.status });
  } catch (error) {
    console.error('Error in Paycrest order creation:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error', error: String(error) },
      { status: 500 }
    );
  }
} 
