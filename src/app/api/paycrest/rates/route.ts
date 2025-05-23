import { NextResponse } from 'next/server';

const PAYCREST_API_KEY = '208a4aef-1320-4222-82b4-e3bca8781b4b';

export async function GET() {
  try {
    // Make the request to Paycrest from the server
    const response = await fetch('https://api.paycrest.io/v1/rates/usdc/1/ngn', {
      headers: {
        'API-Key': PAYCREST_API_KEY
      },
      // Add cache control to prevent stale data
      cache: 'no-store'
    });

    // If the request failed, throw an error
    if (!response.ok) {
      return NextResponse.json(
        { status: 'error', message: 'Failed to fetch rates' },
        { status: response.status }
      );
    }

    // Parse the response and return it
    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in rates proxy:', error);
    
    return NextResponse.json(
      { status: 'error', message: 'Server error while fetching rates' },
      { status: 500 }
    );
  }
} 