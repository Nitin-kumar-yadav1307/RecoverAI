import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'RecoverAI — Failed Payment Recovery',
  description: 'Autonomous failed-payment recovery with Promise-to-Pay memory',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Razorpay checkout loads after hydration to avoid React hydration mismatches. */}
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
