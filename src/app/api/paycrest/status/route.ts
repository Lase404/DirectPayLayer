import { NextResponse } from 'next/server';

const PAYCREST_API_KEY = '208a4aef-1320-4222-82b4-e3bca8781b4b';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { status: 'error', message: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Proxy the request to the Paycrest API
    const response = await fetch(`https://api.paycrest.io/v1/sender/orders/${orderId}`, {
      headers: {
        'API-Key': PAYCREST_API_KEY
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: 'error', message: 'Failed to fetch transaction status' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in transaction status proxy:', error);
    
    return NextResponse.json(
      { status: 'error', message: 'Server error while checking transaction status' },
      { status: 500 }
    );
  }
} 