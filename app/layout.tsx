// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'martrello',
  description: 'Personal Trello with Claude as the writer',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh flex overflow-hidden">
        {/* a11y: skip to main content */}
        <a href="#main-content" className="skip-link">
          Pular para conteúdo principal
        </a>
        <Sidebar />
        <main id="main-content" className="flex-1 min-w-0">
          {children}
        </main>
      </body>
    </html>
  );
}
