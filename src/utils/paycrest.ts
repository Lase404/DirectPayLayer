import axios from 'axios';
import { generateHmacSignature } from './hmac';

const PAYCREST_API_KEY = '208a4aef-1320-4222-82b4-e3bca8781b4b';
const PAYCREST_API_URL = 'https://api.paycrest.io/v1';

export interface BankAccount {
  id: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
}

export interface OfframpQuote {
  id: string;
  sourceAmount: string;
  sourceAsset: string;
  destinationAmount: string;
  destinationAsset: string;
  exchangeRate: string;
  fee: string;
  expiresAt: string;
}

// Link user bank account
export async function linkBankAccount(
  userId: string,
  accountNumber: string,
  bankCode: string
): Promise<BankAccount> {
  try {
    const response = await axios.post(
      `${PAYCREST_API_URL}/accounts`,
      {
        userId,
        accountNumber,
        bankCode,
      },
      {
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error linking bank account:', error);
    throw error;
  }
}

// Get rates for offramp (USDC to Naira) using the correct endpoint format
export async function getOfframpQuote(
  sourceAmount: string,
  sourceAsset: string = 'USDC',
  destinationAsset: string = 'NGN'
): Promise<OfframpQuote> {
  try {
    // Using the correct endpoint format: api.paycrest.io/v1/rates/:token/:amount/:fiat
    const response = await axios.get(
      `${PAYCREST_API_URL}/rates/${sourceAsset}/${sourceAmount}/${destinationAsset}`,
      {
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    // Transform the response to match our OfframpQuote interface
    const data = response.data;
    
    return {
      id: data.id || `quote-${Date.now()}`,
      sourceAmount: sourceAmount,
      sourceAsset: sourceAsset,
      destinationAmount: data.fiatAmount || data.destinationAmount || (parseFloat(sourceAmount) * parseFloat(data.rate || data.exchangeRate)).toString(),
      destinationAsset: destinationAsset,
      exchangeRate: data.rate || data.exchangeRate,
      fee: data.fee || '0',
      expiresAt: data.expiresAt || new Date(Date.now() + 15 * 60000).toISOString(), // Default 15 min expiry
    };
  } catch (error) {
    console.error('Error getting offramp quote:', error);
    throw error;
  }
}

// Create offramp transaction
export async function createOfframpTransaction(
  quoteId: string,
  userId: string,
  bankAccountId: string
): Promise<any> {
  try {
    const response = await axios.post(
      `${PAYCREST_API_URL}/transactions`,
      {
        quoteId,
        userId,
        bankAccountId,
      },
      {
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error creating offramp transaction:', error);
    throw error;
  }
}

// Get transaction history for a user
export async function getTransactionHistory(userId: string): Promise<any[]> {
  try {
    const response = await axios.get(
      `${PAYCREST_API_URL}/transactions/history/${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error getting transaction history:', error);
    throw error;
  }
}

// Get NGN rate for USDC (simpler method) based on the provided example
export async function getRatesForOfframp(): Promise<any> {
  try {
    // Use our proxy endpoint instead of calling Paycrest directly
    const response = await axios.get('/api/paycrest/rates');
    
    if (response.data.status === 'success') {
      return {
        NGN: parseFloat(response.data.data)
      };
    }
    
    return { NGN: 0 };
  } catch (error) {
    console.error('Failed to fetch Paycrest rates:', error);
    return { NGN: 0 };
  }
}

// Verify bank account
export async function verifyBankAccount(institution: string, accountIdentifier: string): Promise<any> {
  try {
    // Use our proxy endpoint instead of calling Paycrest directly
    const response = await axios.post('/api/paycrest/verify-account', 
      {
        institution,
        accountIdentifier
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Failed to verify account:', error);
    throw error;
  }
}

// Create a new order
export async function createOrder(orderData: any): Promise<any> {
  try {
    // Use our proxy endpoint instead of calling Paycrest directly
    const response = await axios.post('/api/paycrest/orders', orderData);
    
    return response.data;
  } catch (error) {
    console.error('Failed to create order:', error);
    throw error;
  }
}

// Check transaction status - now using our proxy endpoint
export async function checkTransactionStatus(orderId: string): Promise<any> {
  try {
    if (!orderId) {
      throw new Error('Order ID is required');
    }
    
    // Use our proxy endpoint instead of mocking or calling Paycrest directly
    const response = await axios.get(`/api/paycrest/status?orderId=${orderId}`);
    
    return response.data;
  } catch (error) {
    console.error('Failed to check transaction status:', error);
    throw error;
  }
} 