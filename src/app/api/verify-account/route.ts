import { NextResponse } from 'next/server';

const PAYCREST_API_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('[verify-account] Received request body:', body);

    // Ensure institution code is uppercase and properly formatted
    const institution = body.institution?.toUpperCase()?.trim();
    if (!institution) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'Institution code is required',
          data: [{ field: 'Institution', message: 'Institution code is required' }]
        },
        { status: 400 }
      );
    }

    const payload = {
      institution,
      accountIdentifier: body.accountIdentifier?.trim()
    };

    console.log('[verify-account] Sending payload to Paycrest:', payload);

    const response = await fetch('https://api.paycrest.io/v1/verify-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': PAYCREST_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('[verify-account] Paycrest response:', data);

    return NextResponse.json(data);
  } catch (error) {
    console.error('[verify-account] Error:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to verify account',
        data: [{ field: 'General', message: error instanceof Error ? error.message : 'Unknown error' }]
      },
      { status: 500 }
    );
  }
} 