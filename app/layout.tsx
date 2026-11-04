// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const jakarta = localFont({
  src: [
    { path: './fonts/PlusJakartaSans-VariableFont_wght.ttf', weight: '200 800', style: 'normal' },
    { path: './fonts/PlusJakartaSans-Italic-VariableFont_wght.ttf', weight: '200 800', style: 'italic' },
  ],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'martrello',
  description: 'Personal Trello with Claude as the writer',
  icons: { icon: '/brand/icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#002B0F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={jakarta.variable}>
      <body className="min-h-dvh flex overflow-hidden">{children}</body>
    </html>
  );
}
