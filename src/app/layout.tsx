import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { configureAxios } from '@/utils/axiosConfig'

// Configure axios globally
configureAxios();

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DirectPay Layer',
  description: 'Offramp your crypto to Naira with ease',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
} 