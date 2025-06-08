'use client'

import { ChangeEvent, InputHTMLAttributes } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string
  error?: string
  fullWidth?: boolean
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export function Input({
  label,
  error,
  fullWidth = false,
  className = '',
  onChange,
  ...props
}: InputProps) {
  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label 
          htmlFor={props.id} 
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
        </label>
      )}
      <input
        type="text"
        className={`
          px-3 py-2 bg-white border shadow-sm border-gray-300 placeholder-gray-400 
          focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500
          disabled:bg-gray-100 disabled:text-gray-500 disabled:border-gray-200
          rounded-md ${error ? 'border-red-500' : ''} ${fullWidth ? 'w-full' : ''} ${className}
        `}
        onChange={onChange}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}