import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { getBankLogoFromPaycrestCode } from '@/utils/banks';

interface Bank {
  name: string;
  code: string;
  type?: 'bank' | 'mobile_money';
}

interface BankSelectDropdownProps {
  options: Bank[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const BankSelectDropdown: React.FC<BankSelectDropdownProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  placeholder = "Choose your bank",
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get the selected bank name
  const selectedBank = options.find(option => option.code === value);

  // Filter options based on search term
  const filteredOptions = searchTerm.trim() === '' 
    ? options 
    : options.filter(option => 
        option.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleOptionClick = (optionCode: string) => {
    onChange(optionCode);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div 
      ref={dropdownRef} 
      className={`relative w-full ${className}`}
    >
      {/* Dropdown Button/Display */}
      <button
        type="button"
        className={`flex items-center justify-between w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedBank ? (
          <div className="flex items-center">
            <div className="w-6 h-6 mr-2 flex-shrink-0 bg-white rounded-md border border-gray-100 overflow-hidden">
              <Image 
                src={getBankLogoFromPaycrestCode(selectedBank.code)}
                alt={selectedBank.name}
                width={24}
                height={24}
                className="object-contain"
              />
            </div>
            <span className="truncate">{selectedBank.name}</span>
          </div>
        ) : (
          <span className="text-gray-500">{placeholder}</span>
        )}
        <svg className="w-4 h-4 ml-2 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
          {/* Search Input */}
          <div className="sticky top-0 bg-white p-2 border-b border-gray-200">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search banks..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          {/* Options List */}
          <ul role="listbox" className="py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <li
                  key={option.code}
                  role="option"
                  aria-selected={value === option.code}
                  className={`flex items-center px-3 py-2.5 cursor-pointer hover:bg-gray-100 ${value === option.code ? 'bg-blue-50' : ''}`}
                  onClick={() => handleOptionClick(option.code)}
                >
                  <div className="w-6 h-6 mr-3 flex-shrink-0 bg-white rounded-md border border-gray-100 overflow-hidden">
                    <Image 
                      src={getBankLogoFromPaycrestCode(option.code)}
                      alt={option.name}
                      width={24}
                      height={24}
                      className="object-contain"
                    />
                  </div>
                  <span className="truncate">{option.name}</span>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-gray-500 text-center">No banks found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default BankSelectDropdown; 