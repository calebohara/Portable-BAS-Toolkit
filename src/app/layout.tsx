import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { AppShell } from '@/components/layout/app-shell';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL || 'https://bas-vault.vercel.app'),
  title: 'BAS Field Vault — Portable Project Toolkit',
  description: 'Field-ready project management for BAS technicians. Organize panel databases, wiring diagrams, sequences, IP plans, device lists, and backups in one place.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicons/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
      { url: '/icons/apple-touch-icon-152.png', sizes: '152x152' },
      { url: '/icons/apple-touch-icon-167.png', sizes: '167x167' },
      { url: '/icons/apple-touch-icon-180.png', sizes: '180x180' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icons/icon-monochrome.svg', color: '#00BCD4' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'BAS Vault',
  },
  openGraph: {
    type: 'website',
    title: 'Portable BAS Project Toolkit',
    description: 'Field-ready project container for building automation systems. Organize panel databases, IP plans, wiring diagrams, and device lists.',
    siteName: 'BAS Field Vault',
    images: [
      {
        url: '/og/og-image.png',
        width: 1200,
        height: 630,
        alt: 'BAS Field Vault — Portable Project Toolkit for Building Automation Systems',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Portable BAS Project Toolkit',
    description: 'Field-ready project container for building automation systems.',
    images: ['/og/twitter-card.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0A1628' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider>
          <TooltipProvider delay={200}>
            <ErrorBoundary>
              <AppShell>{children}</AppShell>
            </ErrorBoundary>
            <Toaster position="bottom-right" richColors />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
