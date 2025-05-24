import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { configureAxios } from '@/utils/axiosConfig'
import dynamic from 'next/dynamic'

// Import WalletInitializer with dynamic import to ensure client-side only rendering
const WalletInitializer = dynamic(
  () => import('@/components/WalletInitializer'),
  { ssr: false }
)

// Configure axios globally
configureAxios();

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DirectPay Layer',
  description: 'Offramp your crypto to Naira with ease',
  icons: {
    icon: '/Group 1000002391 (3).png',
    apple: '/Group 1000002391 (3).png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          {/* Add WalletInitializer to ensure consistent WalletConnect initialization */}
          <WalletInitializer />
          {children}
        </Providers>
      </body>
    </html>
  )
} 