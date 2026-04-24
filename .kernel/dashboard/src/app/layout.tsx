import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kernel Dashboard',
  description: 'Token visualization and memory tracking for multi-agent projects',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white">
        {children}
      </body>
    </html>
  );
}
