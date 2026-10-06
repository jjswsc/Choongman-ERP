import { isOfficeStoreVariant } from '@/lib/office-store-canonical'
import { formatMemberPointsDisplay } from '@/lib/member-points-math'

const BRAND_NAME = 'Choongman Chicken'
const HEADER_NAVY = '#0B2A4A'
const HEADER_REWARDS = '#7FE8D0'
const TEXT_MUTED = '#6B7280'
const TEXT_FOOTER = '#64748B'
const FOOTER_BG = '#E8EEF4'
const EARN_COLOR = '#16A34A'
const USE_COLOR = '#DC2626'
const TEXT_DARK = '#111827'

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
] as const

type FlexText = {
  type: 'text'
  text: string
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | '3xl' | '4xl' | '5xl'
  weight?: 'regular' | 'bold'
  color?: string
  align?: 'start' | 'end' | 'center'
  flex?: number
  wrap?: boolean
  margin?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
}

function flexText(partial: Omit<FlexText, 'type'> & { type?: 'text' }): FlexText {
  return { type: 'text', wrap: true, ...partial }
}

export function formatBangkokThaiBuddhistDateTime(at: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]))
  const day = Number(parts.day)
  const month = Number(parts.month)
  const year = Number(parts.year) + 543
  const hour = String(parts.hour ?? '').padStart(2, '0')
  const minute = String(parts.minute ?? '').padStart(2, '0')
  const monthLabel = THAI_SHORT_MONTHS[month - 1] ?? ''
  return `${day} ${monthLabel} ${year} · ${hour}:${minute} น.`
}

/** 카드 สาขา. 본사 주문은 사진 문구 Online (Office). 그 외는 매장 표시명. */
export function memberPointLineBranchLabel(storeCode?: string, displayName?: string): string {
  const code = String(storeCode || '').trim()
  const name = String(displayName || '').trim()
  if (isOfficeStoreVariant(code) || isOfficeStoreVariant(name)) return 'Online (Office)'
  return name || code
}

export function formatMemberPointLineOrderAmount(raw: number): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return ''
  return `B ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatMemberLineHonorificName(raw: string | undefined): string {
  const n = String(raw || '')
    .trim()
    .replace(/^คุณ\s*/, '')
    .trim()
  return n
}

export function defaultMemberPointNotifyReason(params: { earned: number; used: number }): string {
  if (Number(params.earned || 0) > 0) return 'ซื้อสินค้าที่ร้าน'
  if (Number(params.used || 0) > 0) return 'ใช้แต้มที่ร้าน'
  return 'ซื้อสินค้าที่ร้าน'
}

function resolveHeadline(params: { earned: number; used: number }): {
  title: string
  delta: string
  deltaColor: string
  boxColor: string
  caption: string
} {
  const earned = Number(params.earned || 0)
  const used = Number(params.used || 0)
  if (earned > 0 && used > 0) {
    return {
      title: 'คุณอัปเดตแต้มแล้ว',
      delta: `+${formatMemberPointsDisplay(earned)} / -${formatMemberPointsDisplay(used)}`,
      deltaColor: TEXT_DARK,
      boxColor: '#F3F4F6',
      caption: 'แต้มสะสม',
    }
  }
  if (earned > 0) {
    return {
      title: 'คุณได้รับแต้มแล้ว',
      delta: `+${formatMemberPointsDisplay(earned)}`,
      deltaColor: EARN_COLOR,
      boxColor: '#E8F6EE',
      caption: 'แต้มสะสม',
    }
  }
  return {
    title: 'คุณใช้แต้มแล้ว',
    delta: `-${formatMemberPointsDisplay(used)}`,
    deltaColor: USE_COLOR,
    boxColor: '#FEF2F2',
    caption: 'แต้มที่ใช้',
  }
}

function detailRow(label: string, value: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'md',
    alignItems: 'center',
    contents: [
      flexText({ text: label, size: 'sm', color: TEXT_MUTED, flex: 4, wrap: false }),
      flexText({ text: value, size: 'sm', color: TEXT_DARK, align: 'end', flex: 6, wrap: true }),
    ],
  }
}

export function buildMemberPointLineFlexMessage(params: {
  earned: number
  used: number
  balanceAfter: number
  tierCode?: string
  storeCode?: string
  storeLabel?: string
  orderAmount?: number
  orderNo?: string
  memberName?: string
  reason?: string
  occurredAt?: Date
}): { altText: string; contents: Record<string, unknown> } {
  const headline = resolveHeadline(params)
  const honorificName = formatMemberLineHonorificName(params.memberName)
  const greeting = honorificName ? `สวัสดี คุณ${honorificName}` : 'สวัสดีครับ'
  const reason = String(params.reason || '').trim() || defaultMemberPointNotifyReason(params)
  const balance = formatMemberPointsDisplay(params.balanceAfter)
  const stamp = formatBangkokThaiBuddhistDateTime(params.occurredAt ?? new Date())
  const tier = String(params.tierCode || '').trim()
  const branch = memberPointLineBranchLabel(params.storeCode, params.storeLabel)
  const orderAmount =
    params.orderAmount != null && Number.isFinite(Number(params.orderAmount))
      ? formatMemberPointLineOrderAmount(Number(params.orderAmount))
      : ''

  const altParts = [greeting, headline.title, headline.delta, `คงเหลือ ${balance} แต้ม`].filter(Boolean)
  const altText = `${BRAND_NAME}: ${altParts.join(' · ')}`.slice(0, 400)

  const detailRows: Record<string, unknown>[] = []
  if (tier) detailRows.push(detailRow('ระดับสมาชิก', tier))
  if (orderAmount) detailRows.push(detailRow('ยอดคำสั่งซื้อ', orderAmount))
  if (branch) detailRows.push(detailRow('สาขา', branch))
  if (reason) detailRows.push(detailRow('รายการ', reason))

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        flexText({
          text: 'CHOONGMAN',
          weight: 'bold',
          size: 'sm',
          color: '#FFFFFF',
          flex: 1,
          wrap: false,
        }),
        flexText({
          text: 'REWARDS',
          weight: 'bold',
          size: 'sm',
          color: HEADER_REWARDS,
          align: 'end',
          wrap: false,
        }),
      ],
      backgroundColor: HEADER_NAVY,
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        flexText({
          text: greeting,
          size: 'sm',
          color: TEXT_MUTED,
        }),
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          paddingAll: '16px',
          backgroundColor: headline.boxColor,
          cornerRadius: '12px',
          contents: [
            flexText({
              text: headline.title,
              size: 'sm',
              color: TEXT_DARK,
              align: 'center',
              wrap: false,
            }),
            flexText({
              text: headline.delta,
              size: '3xl',
              weight: 'bold',
              color: headline.deltaColor,
              align: 'center',
              margin: 'sm',
              wrap: false,
            }),
            flexText({
              text: headline.caption,
              size: 'xs',
              color: TEXT_MUTED,
              align: 'center',
              margin: 'sm',
              wrap: false,
            }),
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'lg',
          alignItems: 'center',
          contents: [
            flexText({ text: 'แต้มคงเหลือ', size: 'sm', color: TEXT_MUTED, flex: 4, wrap: false }),
            flexText({
              text: balance,
              size: 'xl',
              weight: 'bold',
              color: HEADER_NAVY,
              align: 'end',
              flex: 4,
              wrap: false,
            }),
            flexText({
              text: 'แต้ม',
              size: 'xs',
              color: HEADER_NAVY,
              align: 'end',
              flex: 2,
              margin: 'sm',
              wrap: false,
            }),
          ],
        },
        ...(detailRows.length
          ? [{ type: 'separator', margin: 'md', color: '#E5E7EB' }, ...detailRows]
          : []),
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        flexText({
          text: 'ขอบคุณที่อร่อยไปด้วยกัน',
          size: 'xs',
          color: TEXT_FOOTER,
          align: 'center',
          wrap: true,
        }),
        flexText({
          text: stamp,
          size: 'xxs',
          color: TEXT_FOOTER,
          align: 'center',
        }),
      ],
      backgroundColor: FOOTER_BG,
      paddingAll: '14px',
    },
  }

  return { altText, contents: bubble }
}
