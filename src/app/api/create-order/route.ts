import { NextResponse } from 'next/server';

const PAYCREST_API_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch('https://api.paycrest.io/v1/sender/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': PAYCREST_API_KEY
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
} 