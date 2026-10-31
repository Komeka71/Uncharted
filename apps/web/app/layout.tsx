import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Culprit — Agentic CI Failure Investigator',
  description: 'CI tells you that your build failed. Culprit tells you why, which commit did it, whether it is flaky, and how to fix it.',
  keywords: ['CI/CD', 'GitHub Actions', 'Flaky Tests', 'Developer Tools', 'AI Agent', 'Debugging']
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-bg text-text antialiased cyber-grid`}>
        {children}
      </body>
    </html>
  );
}
