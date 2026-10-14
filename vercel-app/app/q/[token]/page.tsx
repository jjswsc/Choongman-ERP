import { PosQueuePublicView } from '@/components/pos-queue/pos-queue-public-view'
import { getServerAppBrandConfig } from '@/lib/app-brand-server'

type PageProps = { params: Promise<{ token: string }> }

export default async function QueueTicketPage({ params }: PageProps) {
  const { token } = await params
  const brand = await getServerAppBrandConfig()
  return (
    <PosQueuePublicView
      token={decodeURIComponent(token || '')}
      brandName={brand.key === 'omnifoodtech' ? brand.headerWordmark : 'Choongman Chicken'}
      lineOfficialUrl={brand.memberContactLineOfficialUrl}
    />
  )
}
