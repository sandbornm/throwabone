import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Throwabone — Find your throw',
  description:
    'Find your throw. A 3D bone-throwing practice range with authentic bone shapes, underhand throws, and adjustable ground surfaces.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
