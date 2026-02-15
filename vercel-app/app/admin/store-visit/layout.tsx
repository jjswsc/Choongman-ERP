import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "매장 방문 현황 - 통계 대시보드",
  description: "매장 방문 데이터를 다양한 관점에서 분석하는 통계 대시보드",
}

export default function StoreVisitLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <>{children}</>
}
