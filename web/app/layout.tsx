import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';
import './globals.css';
import { ServiceWorker } from '@/components/ServiceWorker';

/**
 * Both faces are self-hosted at build time by next/font, so opening this on a
 * phone on a bad connection is one fewer thing that has to succeed. Nothing
 * here reaches a font CDN at runtime, which also means the app keeps its look
 * offline rather than falling back to the system face once it is installed.
 *
 * `display: swap` on both: the words arrive first and the face follows. On a
 * slow connection that is the difference between reading a question late and
 * looking at a blank screen.
 */
const body = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Family plan',
  description: 'Our own check-in. To a bigger life.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Family plan',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // The links are private. Keep them out of search results entirely.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e1012',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // colorScheme is declared here as well as in the stylesheet so the browser
    // knows before the first paint. Without it a phone on a light system theme
    // flashes white behind the page while the CSS is still arriving.
    <html lang="en" className={`${body.variable} ${display.variable}`} style={{ colorScheme: 'dark' }}>
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
