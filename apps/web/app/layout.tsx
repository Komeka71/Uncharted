import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600']
});

export const viewport: Viewport = {
  themeColor: '#060D0A',
  colorScheme: 'dark'
};

export const metadata: Metadata = {
  title: 'Origin — Agentic CI Failure Investigator',
  description: 'CI tells you that your build failed. Origin investigates logs, classifies deterministic rules, ranks suspect commits, and fixes the build in seconds.',
  keywords: ['CI/CD', 'GitHub Actions', 'Flaky Tests', 'Developer Tools', 'AI Agent', 'Debugging']
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="min-h-screen bg-bg text-text antialiased font-sans selection:bg-accent/30 selection:text-text">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-bg focus:font-semibold focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent-strong"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
