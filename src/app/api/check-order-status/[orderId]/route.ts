import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId } = params
    
    const response = await fetch(`https://api.paycrest.io/v1/sender/orders/${orderId}`, {
      headers: {
        'API-Key': '7f7d8575-be32-4598-b6a2-43801fe173dc',
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error checking order status:', error)
    return NextResponse.json(
      { status: 'error', message: 'Failed to check order status' },
      { status: 500 }
    )
  }
} 