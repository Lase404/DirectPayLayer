import crypto from 'crypto';

/**
 * Generates an HMAC signature for Paycrest API authentication
 * @param data - The data string to create a signature for
 * @param privateKey - The private key to use for signing
 * @returns The hexadecimal HMAC signature
 */
export function generateHmacSignature(data: string, privateKey: string): string {
  const hmac = crypto.createHmac('sha256', privateKey);
  hmac.update(data);
  return hmac.digest('hex');
} 