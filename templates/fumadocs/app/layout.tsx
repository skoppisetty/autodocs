import { RootProvider } from 'fumadocs-ui/provider';
import type { ReactNode } from 'react';
import './global.css';

export const metadata = {
  title: 'Documentation',
  description: 'Generated with autodocs',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
