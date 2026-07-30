import { QrTableGuestApp } from '@/components/qr-table/qr-table-guest-app'

type PageProps = { params: Promise<{ token: string }> }

export default async function QrTableTokenPage({ params }: PageProps) {
  const { token } = await params
  return <QrTableGuestApp token={decodeURIComponent(token || '')} />
}
