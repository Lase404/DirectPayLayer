import React from 'react';
import Image from 'next/image';
import { getBankLogoFromPaycrestCode, getBankNameFromPaycrestCode } from '@/utils/banks';

interface BankAccountDisplayProps {
  institution: string; // Paycrest bank code 
  accountName: string;
  accountNumber: string;
  memo?: string;
  compact?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onSelect?: () => void;
  selected?: boolean;
  className?: string;
}

/**
 * A component for displaying bank account details with bank logo
 * Used consistently across the application to maintain visual identity
 */
const BankAccountDisplay: React.FC<BankAccountDisplayProps> = ({
  institution,
  accountName,
  accountNumber,
  memo,
  compact = false,
  onEdit,
  onDelete,
  onSelect,
  selected = false,
  className = ''
}) => {
  const bankLogo = getBankLogoFromPaycrestCode(institution);
  const bankName = getBankNameFromPaycrestCode(institution);
  
  // Default component is clickable if onSelect is provided
  const isClickable = !!onSelect;
  
  if (compact) {
    return (
      <div 
        className={`flex items-center p-2 ${isClickable ? 'cursor-pointer hover:bg-gray-50' : ''} ${selected ? 'bg-blue-50' : ''} ${className}`}
        onClick={onSelect}
      >
        <div className="w-6 h-6 rounded-md overflow-hidden flex-shrink-0">
          <Image 
            src={bankLogo} 
            alt={bankName}
            width={24} 
            height={24}
            className="object-contain"
          />
        </div>
        <div className="ml-2 flex-grow min-w-0">
          <div className="flex justify-between">
            <p className="font-medium text-sm text-gray-900 truncate">{bankName}</p>
            {selected && (
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{accountNumber}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      className={`border border-gray-200 rounded-lg p-4 ${isClickable ? 'cursor-pointer hover:border-blue-300' : ''} ${selected ? 'bg-blue-50 border-blue-300' : 'bg-white'} ${className}`}
      onClick={onSelect}
    >
      <div className="flex items-start">
        <div className="w-12 h-12 rounded-md overflow-hidden border border-gray-100 bg-white flex items-center justify-center">
          <Image 
            src={bankLogo} 
            alt={bankName}
            width={48} 
            height={48}
            className="object-contain"
          />
        </div>
        
        <div className="ml-4 flex-1">
          <h4 className="font-medium text-gray-900">{bankName}</h4>
          <p className="text-sm text-gray-600">{accountNumber}</p>
          <p className="text-sm font-medium text-gray-800">{accountName}</p>
          {memo && <p className="text-xs text-gray-500 mt-1">{memo}</p>}
        </div>
        
        {(onEdit || onDelete) && (
          <div className="flex space-x-2">
            {onEdit && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            
            {onDelete && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-2 text-red-600 hover:bg-red-50 rounded-full"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BankAccountDisplay; 