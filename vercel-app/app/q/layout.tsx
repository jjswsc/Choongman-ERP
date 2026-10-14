import type { Metadata, Viewport } from 'next'
import { getServerAppBrandConfig } from '@/lib/app-brand-server'

export const dynamic = 'force-dynamic'

/** /q/* — 자리 대기 번호표 손님 상태 화면 (로그인 없음) */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getServerAppBrandConfig()
  return {
    title: `${brand.key === 'omnifoodtech' ? brand.headerWordmark : 'Choongman Chicken'} Queue`,
    description: 'Queue status',
    robots: { index: false, follow: false },
  }
}

export const viewport: Viewport = {
  themeColor: '#b45309',
  width: 'device-width',
  initialScale: 1,
}

export default function QueueTicketLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
