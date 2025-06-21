import { NextResponse } from 'next/server'

const PAYCREST_API_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { orderId } = body

    if (!orderId) {
      return NextResponse.json(
        { status: 'error', message: 'Order ID is required' },
        { status: 400 }
      )
    }

    const response = await fetch(`https://api.paycrest.io/v1/sender/orders/${orderId}`, {
      headers: {
        'API-Key': PAYCREST_API_KEY,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Paycrest API error:', errorText)
      return NextResponse.json(
        { status: 'error', message: 'Failed to fetch order status from Paycrest' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error checking order status:', error)
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    )
  }
} 