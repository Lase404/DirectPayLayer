'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          <h3 className="font-medium">Something went wrong</h3>
          <p className="mt-1 text-sm">{this.state.error?.message}</p>
          <button
            className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
} 