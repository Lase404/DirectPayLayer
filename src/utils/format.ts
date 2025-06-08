// Function to truncate Ethereum address
export function truncateAddress(address: string): string {
  if (!address) return '';
  const start = address.substring(0, 6);
  const end = address.substring(address.length - 4);
  return `${start}...${end}`;
}

// Format a number with thousand separators
export function formatNumber(value: number | string, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num);
}

// Format currency with symbol
export function formatCurrency(
  value: number | string,
  currency = 'USD',
  decimals = 2
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Format Naira
export function formatNaira(value: number | string, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `₦${formatNumber(num, decimals)}`;
}

// Format crypto amount with symbol
export function formatCrypto(amount: string | number, symbol?: string): string {
  const value = typeof amount === 'string' ? amount : amount.toString();
  const formatted = parseFloat(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
  
  return symbol ? `${formatted} ${symbol}` : formatted;
}