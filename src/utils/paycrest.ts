import axios from 'axios';

const PAYCREST_API_KEY = '7f7d8575-be32-4598-b6a2-43801fe173dc';
const PAYCREST_API_URL = 'https://api.paycrest.io/v1'; // Updated URL with v1 path

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
export async function getRatesForOfframp(): Promise<Record<string, number>> {
  try {
    const response = await axios.get(
      `${PAYCREST_API_URL}/rates/USDC/1/NGN`,
      {
        headers: {
          'Authorization': `Bearer ${PAYCREST_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log("Paycrest NGN rate response:", response.data);
    
    if (response.data && response.data.status === "success") {
      // The data field contains the direct exchange rate value
      const rate = parseFloat(response.data.data);
      return { NGN: rate };
    }
    
    // Fallback rate if API response format is unexpected
    return { NGN: 1601.02 };
  } catch (error) {
    console.error('Error getting NGN rate:', error);
    // Return fallback rate in case of API error
    return { NGN: 1601.02 };
  }
} 