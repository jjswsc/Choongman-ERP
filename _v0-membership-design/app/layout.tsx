import type { Metadata, Viewport } from 'next'
import { Noto_Sans_Thai, Geist_Mono } from 'next/font/google'
import './globals.css'

const notoSansThai = Noto_Sans_Thai({
  variable: '--font-geist-sans',
  subsets: ['thai', 'latin'],
})
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'CHOONGMAN Membership',
  description: 'ระบบสมาชิก Choongman Chicken — สะสมแต้ม แลกรางวัล รับสิทธิพิเศษ',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="th" className={`${notoSansThai.variable} ${geistMono.variable}`}>
      <body className="bg-background font-sans antialiased">{children}</body>
    </html>
  )
}
