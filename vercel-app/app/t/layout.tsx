import type { Metadata, Viewport } from 'next'
import { getServerAppBrandConfig } from '@/lib/app-brand-server'

export const dynamic = 'force-dynamic'

/** /t/* — QR 테이블 주문 게스트 (viewport·PWA; 주소창 완전 숨김은 standalone 설치 시) */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerAppBrandConfig()
  const title = `${brand.headerWordmark} Table Order`
  return {
    title,
    description: 'QR table order',
    manifest: '/manifest-qr-table.json',
    applicationName: title,
    icons: {
      icon: [
        { url: '/icon-pos-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-pos-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icon-pos-512.png', sizes: '512x512', type: 'image/png' }],
    },
    appleWebApp: {
      capable: true,
      title,
      statusBarStyle: 'black-translucent',
    },
  }
}

export const viewport: Viewport = {
  themeColor: '#b45309',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function QrTableLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
