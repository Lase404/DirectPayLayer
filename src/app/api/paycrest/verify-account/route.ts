import { NextResponse } from 'next/server';

const PAYCREST_API_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';

export async function POST(request: Request) {
  try {
    const accountData = await request.json();

    // Proxy the request to Paycrest API
    const response = await fetch(`https://api.paycrest.io/v1/verify-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': PAYCREST_API_KEY
      },
      body: JSON.stringify(accountData)
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: 'error', message: 'Failed to verify account' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in account verification proxy:', error);
    
    return NextResponse.json(
      { status: 'error', message: 'Server error while verifying account' },
      { status: 500 }
    );
  }
} 