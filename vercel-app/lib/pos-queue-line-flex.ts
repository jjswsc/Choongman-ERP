/** 자리 대기 호출 LINE Flex 카드 — 포인트 알림(CHOONGMAN REWARDS)과 같은 톤 */
import { formatBangkokThaiBuddhistDateTime } from '@/lib/member-point-line-flex'
import { formatPosQueueNo } from '@/lib/pos-queue-ticket'

const BRAND_NAME = 'Choongman Chicken'
const HEADER_NAVY = '#0B2A4A'
const HEADER_ACCENT = '#7FE8D0'
const TEXT_MUTED = '#6B7280'
const TEXT_DARK = '#111827'
const TEXT_FOOTER = '#64748B'
const FOOTER_BG = '#E8EEF4'

function text(partial: Record<string, unknown>): Record<string, unknown> {
  return { type: 'text', wrap: true, ...partial }
}

function detailRow(label: string, value: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'md',
    contents: [
      text({ text: label, size: 'sm', color: TEXT_MUTED, flex: 4, wrap: false }),
      text({ text: value, size: 'sm', color: TEXT_DARK, align: 'end', flex: 6 }),
    ],
  }
}

export function buildPosQueueCallLineFlexMessage(params: {
  queueNo: number
  partySize: number
  storeLabel: string
  callCount: number
  /** /q/{token} 손님 상태 화면 — https 일 때만 버튼 */
  statusUrl?: string
  occurredAt?: Date
}): { altText: string; contents: Record<string, unknown> } {
  const no = formatPosQueueNo(params.queueNo)
  const party = Math.max(1, Math.floor(Number(params.partySize) || 1))
  const recall = params.callCount > 1
  const title = recall ? `เรียกคิวอีกครั้งครับ (ครั้งที่ ${params.callCount})` : 'ถึงคิวของคุณแล้วครับ'
  const box = recall
    ? { bg: '#FEF3C7', no: '#B45309' }
    : { bg: '#E8F6EE', no: '#16A34A' }
  const statusUrl = String(params.statusUrl || '').trim()
  const altText = `${BRAND_NAME}: ${title} · คิว ${no}`.slice(0, 400)

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'horizontal',
      backgroundColor: HEADER_NAVY,
      paddingAll: '16px',
      contents: [
        text({ text: 'CHOONGMAN', weight: 'bold', size: 'sm', color: '#FFFFFF', flex: 1, wrap: false }),
        text({ text: 'QUEUE', weight: 'bold', size: 'sm', color: HEADER_ACCENT, align: 'end', wrap: false }),
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '20px',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          backgroundColor: box.bg,
          cornerRadius: '12px',
          contents: [
            text({ text: title, size: 'sm', weight: 'bold', color: TEXT_DARK, align: 'center' }),
            text({ text: 'หมายเลขคิว · Queue', size: 'xs', color: TEXT_MUTED, align: 'center', margin: 'md', wrap: false }),
            text({ text: no, size: '5xl', weight: 'bold', color: box.no, align: 'center', wrap: false }),
            text({ text: 'Your table is ready', size: 'xs', color: TEXT_MUTED, align: 'center', margin: 'sm', wrap: false }),
          ],
        },
        text({
          text: 'กรุณาแสดงหมายเลขนี้ที่หน้าร้านครับ',
          size: 'sm',
          color: TEXT_DARK,
          align: 'center',
          margin: 'lg',
        }),
        { type: 'separator', margin: 'lg', color: '#E5E7EB' },
        detailRow('จำนวน', `${party} ท่าน`),
        ...(params.storeLabel ? [detailRow('สาขา', params.storeLabel)] : []),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      backgroundColor: FOOTER_BG,
      paddingAll: '14px',
      contents: [
        ...(/^https:\/\//i.test(statusUrl)
          ? [
              {
                type: 'button',
                style: 'primary',
                height: 'sm',
                color: HEADER_NAVY,
                action: { type: 'uri', label: 'ดูสถานะคิว', uri: statusUrl },
              },
            ]
          : []),
        text({
          text: formatBangkokThaiBuddhistDateTime(params.occurredAt ?? new Date()),
          size: 'xxs',
          color: TEXT_FOOTER,
          align: 'center',
        }),
      ],
    },
  }
  return { altText, contents: bubble }
}
