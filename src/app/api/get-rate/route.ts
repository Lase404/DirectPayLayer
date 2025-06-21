import { NextResponse } from 'next/server';

const PAYCREST_API_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';

export async function GET() {
  try {
    const response = await fetch('https://api.paycrest.io/v1/rates/usdc/1/ngn', {
      headers: {
        'API-Key': PAYCREST_API_KEY
      }
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching rate:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rate' },
      { status: 500 }
    );
  }
} 