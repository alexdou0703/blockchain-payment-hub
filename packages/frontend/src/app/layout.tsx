import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import dynamic from 'next/dynamic';
import './globals.css';
import { BrowserErrorReporter } from '@/components/browser-error-reporter';

// wagmi/RainbowKit access localStorage at module init — must be client-only
const Web3Provider = dynamic(
  () => import('@/providers/Web3Provider').then((m) => m.Web3Provider),
  { ssr: false },
);

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Blockchain Payment Hub',
  description: 'Decentralised escrow payment gateway',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <BrowserErrorReporter />
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
