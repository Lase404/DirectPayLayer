import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const PUBLIC_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';
const PRIVATE_KEY = 'w7Nrej-opuRPXbuEmDoYRQ04msZCvE1yBnebcAx34ck=';
const DEFAULT_DESTINATION_ADDRESS = '0x1a84de15BD8443d07ED975a25887Fc4E6779DfaF';

// Helper function to detect Solana addresses
const isSolanaAddress = (address: string): boolean => {
  return typeof address === 'string' && 
         !address.startsWith('0x') && 
         /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function generateHmacSignature(data: string, privateKey: string): string {
  const hmac = crypto.createHmac('sha256', privateKey);
  hmac.update(data);
  return hmac.digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate and replace Solana address if present
    if (body.returnAddress && isSolanaAddress(body.returnAddress)) {
      console.log(`API route: Replacing Solana return address: ${body.returnAddress} → ${DEFAULT_DESTINATION_ADDRESS}`);
      body.returnAddress = DEFAULT_DESTINATION_ADDRESS;
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

    console.log('Sending validated payload to Paycrest:', payloadWithTimestamp);

    const paycrestRes = await fetch('https://api.paycrest.io/v1/sender/orders/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': '7f7d8575-be32-4598-b6a2-43801fe173dc',
      },
      body: stringifiedBody,
    });

    if (!paycrestRes.ok) {
      const errorData = await paycrestRes.json();
      console.error('Paycrest API error:', errorData);
      return NextResponse.json(
        { 
          status: 'error', 
          message: errorData.message || 'Failed to create order',
          data: errorData.data 
        }, 
        { status: paycrestRes.status }
      );
    }

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