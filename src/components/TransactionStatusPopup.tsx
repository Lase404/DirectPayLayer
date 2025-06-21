import React, { useEffect, useState } from 'react';
import bankLogoMap from '../../public/bank-logos/bank-logo-map.json';

interface BankDetails {
  accountName: string;
  accountIdentifier: string;
  institution: string;
  code?: string;
}

interface TransactionStatusPopupProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string;
  originToken?: {
    symbol: string;
    amount: string;
  };
  usdcAmount?: string;
  nairaAmount?: string;
  bankDetails?: BankDetails;
}

// Enhanced status type
type TransactionStatusType = 'initiated' | 'processing' | 'pending_payout' | 'settled' | 'refunded' | 'expired' | 'failed';

interface OrderStatus {
  status: TransactionStatusType;
  amountPaid?: string;
  txHash?: string;
  recipient?: {
    accountName: string;
    accountIdentifier: string;
    institution: string;
    code?: string;
  };
  rate?: string;
  amount?: string;
}

// Status flow configuration
const STATUS_CONFIG = {
  initiated: {
    color: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    message: "Initializing your transaction...",
    description: "We're getting everything ready for your transfer."
  },
  processing: {
    color: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    message: "Processing your payment...",
    description: "Your crypto is being converted to USDC."
  },
  pending_payout: {
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    message: "Funds are on the way! 🚀",
    description: "We're sending the money to your bank account."
  },
  settled: {
    color: 'bg-green-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    message: "Ẹ kú orírẹ! Your money don land! 🎉",
    description: "Transaction complete! Check your bank account."
  },
  refunded: {
    color: 'bg-orange-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    message: "Payment has been refunded",
    description: "The funds have been returned to your wallet."
  },
  expired: {
    color: 'bg-red-500',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    message: "Transaction has expired",
    description: "This order is no longer valid. Please create a new one."
  },
  failed: {
    color: 'bg-red-500',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    message: "Transaction failed",
    description: "Something went wrong. Please try again or contact support."
  }
};

const DIRECTPAY_LOGO = '/Group 1000002391 (3).png';

// Helper function to get bank logo path
const getBankLogo = (bankName: string, bankCode?: string): string => {
  // First try to find by bank code
  if (bankCode) {
    const bankByCode = bankLogoMap[bankCode];
    if (bankByCode) {
      return bankByCode.logoPath;
    }
  }

  // Then try to find by name match
  const bankEntry = Object.values(bankLogoMap).find(bank => 
    bank.name.toLowerCase() === bankName.toLowerCase() ||
    bank.name.toLowerCase().includes(bankName.toLowerCase()) ||
    bankName.toLowerCase().includes(bank.name.toLowerCase())
  );

  if (bankEntry) {
    return bankEntry.logoPath;
  }

  // Special cases for common names
  const specialCases: { [key: string]: string } = {
    'PalmPay': '/bank-logos/palmpay.png',
    'OPay': '/bank-logos/opay.png',
    'Kuda': '/bank-logos/kuda-bank.png',
    'Moniepoint': '/bank-logos/moniepoint-mfb-ng.png'
  };

  for (const [key, value] of Object.entries(specialCases)) {
    if (bankName.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  // Default fallback
  return '/bank-logos/default-image.png';
};

export default function TransactionStatusPopup({
  isOpen,
  onClose,
  orderId,
  originToken,
  usdcAmount,
  nairaAmount,
  bankDetails
}: TransactionStatusPopupProps) {
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const checkOrderStatus = async () => {
      if (!orderId) return;

      // For test order, simulate status flow
      if (orderId === '599fffbf-2679-43c7-b2cf-fe81e13acc6a') {
        const statusFlow: TransactionStatusType[] = ['initiated', 'processing', 'pending_payout', 'settled'];
        let currentIndex = 0;

        const updateStatus = () => {
          if (currentIndex < statusFlow.length) {
            setOrderStatus({
              status: statusFlow[currentIndex],
              amount: '0.5',
              rate: '1558.79',
              recipient: {
                accountName: 'ajibola margaret adunbi',
                accountIdentifier: '7045620184',
                institution: 'PalmPay',
                code: 'PALMNGPC'
              },
              txHash: currentIndex >= 2 ? '0x123...abc' : undefined
            });
            currentIndex++;
          }
        };

        // Initial status
        updateStatus();

        // Update status every 5 seconds
        const interval = setInterval(() => {
          updateStatus();
          if (currentIndex >= statusFlow.length) {
            clearInterval(interval);
          }
        }, 5000);

        return;
      }

      try {
        const response = await fetch('/api/check-order-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ orderId })
        });

        if (!response.ok) {
          throw new Error('Failed to fetch order status');
        }

        const data = await response.json();
        
        if (data.status === 'success' && data.data) {
          setOrderStatus({
            status: data.data.status,
            amountPaid: data.data.amountPaid,
            txHash: data.data.txHash,
            recipient: data.data.recipient,
            rate: data.data.rate,
            amount: data.data.amount
          });

          if (['settled', 'refunded', 'expired', 'failed'].includes(data.data.status)) {
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        setError('Failed to check order status');
        console.error('Error checking order status:', err);
      }
    };

    if (isOpen && orderId) {
      checkOrderStatus();
      pollInterval = setInterval(checkOrderStatus, 30000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  const getStatusConfig = () => {
    return orderStatus?.status ? STATUS_CONFIG[orderStatus.status] : STATUS_CONFIG.initiated;
  };

  const config = getStatusConfig();

  const calculateNairaAmount = () => {
    if (orderStatus?.amount && orderStatus?.rate) {
      const amount = parseFloat(orderStatus.amount);
      const rate = parseFloat(orderStatus.rate);
      return (amount * rate).toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    return nairaAmount;
  };

  return (
    <>
      {/* Blur Overlay - only show when not minimized */}
      {!isMinimized && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          onClick={() => setIsMinimized(true)}
        />
      )}

      {isMinimized ? (
        // Minimized floating button - no blur
        <div className="fixed bottom-4 right-4 z-40">
          <div 
            onClick={() => setIsMinimized(false)}
            className="bg-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-all hover:scale-105"
          >
            <div className="flex items-center gap-2">
              <img src={DIRECTPAY_LOGO} alt="DirectPay" className="w-6 h-6" />
              {orderStatus?.recipient && (
                <img 
                  src={getBankLogo(orderStatus.recipient.institution, orderStatus.recipient.code)}
                  alt={orderStatus.recipient.institution}
                  className="w-6 h-6 rounded-full"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${getStatusConfig().color} animate-pulse`} />
              <span className="font-medium text-sm">
                ₦{calculateNairaAmount()}
              </span>
            </div>
          </div>
        </div>
      ) : (
        // Centered Modal with blur
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <img src={DIRECTPAY_LOGO} alt="DirectPay" className="w-8 h-8" />
                <h3 className="text-lg font-semibold">Transaction Status</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="text-gray-400 hover:text-gray-600 p-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 p-2"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Enhanced Status Banner */}
            <div className={`p-6 ${config.bgColor} ${config.textColor}`}>
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${config.color} animate-pulse`} />
                  <p className="text-lg font-semibold">{config.message}</p>
                </div>
                <p className="text-sm opacity-75">{config.description}</p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Amount Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-gray-600">Amount:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{orderStatus?.amount || originToken?.amount} USDC</span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="font-medium">₦{calculateNairaAmount()}</span>
                  </div>
                </div>
              </div>

              {/* Recipient Details */}
              {orderStatus?.recipient && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <img 
                      src={getBankLogo(orderStatus.recipient.institution, orderStatus.recipient.code)}
                      alt={orderStatus.recipient.institution}
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <div className="font-medium">{orderStatus.recipient.institution}</div>
                      <div className="text-sm text-gray-500">Recipient Bank</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Account Name:</span>
                      <span className="font-medium">{orderStatus.recipient.accountName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Account Number:</span>
                      <span className="font-medium">{orderStatus.recipient.accountIdentifier}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Transaction Hash */}
              {orderStatus?.txHash && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <a
                    href={`https://basescan.org/tx/${orderStatus.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 flex items-center justify-center gap-2"
                  >
                    <span>View Transaction on BaseScan</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}

              {error && (
                <div className="bg-red-50 text-red-600 rounded-lg p-4 text-sm">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
} 