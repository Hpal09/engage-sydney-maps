import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Engage Sydney',
  description: 'AI-powered interactive mapping for Sydney CBD - Find food, navigate, and explore',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}


