import { NextResponse } from 'next/server';

const PAYCREST_API_KEY = '208a4aef-1320-4222-82b4-e3bca8781b4b';

export async function POST(request: Request) {
  try {
    const orderData = await request.json();

    // Proxy the request to Paycrest API
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
      console.error('Paycrest API error:', errorText);
      
      return NextResponse.json(
        { status: 'error', message: `Failed to create order: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in order creation proxy:', error);
    
    return NextResponse.json(
      { status: 'error', message: 'Server error while creating order' },
      { status: 500 }
    );
  }
} 