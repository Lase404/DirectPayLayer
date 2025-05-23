import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const PUBLIC_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';
const PRIVATE_KEY = 'w7Nrej-opuRPXbuEmDoYRQ04msZCvE1yBnebcAx34ck=';

function generateHmacSignature(data: string, privateKey: string): string {
  const hmac = crypto.createHmac('sha256', privateKey);
  hmac.update(data);
  return hmac.digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Add timestamp to the payload
    const payloadWithTimestamp = {
      ...body,
      timestamp: Math.floor(Date.now() / 1000) // Unix timestamp in seconds
    };
    
    const stringifiedBody = JSON.stringify(payloadWithTimestamp);
    
    // Generate HMAC signature
    const signature = generateHmacSignature(stringifiedBody, PRIVATE_KEY);
    const authHeader = `HMAC ${PUBLIC_KEY}:${signature}`;

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