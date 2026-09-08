import { formatMemberPointsDisplay } from '@/lib/member-points-math'

const BRAND_NAME = 'Choongman Chicken'
const HEADER_NAVY = '#0B2A4A'
const HEADER_REWARDS = '#7FE8D0'
const TEXT_MUTED = '#6B7280'
const TEXT_TITLE = '#1E3A8A'
const TEXT_BALANCE = '#1D4ED8'
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
  return `${day} ${monthLabel} ${year} ${hour}:${minute}`
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
} {
  const earned = Number(params.earned || 0)
  const used = Number(params.used || 0)
  if (earned > 0 && used > 0) {
    return {
      title: 'คุณอัปเดตแต้ม',
      delta: `+${formatMemberPointsDisplay(earned)} / -${formatMemberPointsDisplay(used)} แต้ม`,
      deltaColor: TEXT_DARK,
    }
  }
  if (earned > 0) {
    return {
      title: 'คุณได้รับแต้ม',
      delta: `+${formatMemberPointsDisplay(earned)} แต้ม`,
      deltaColor: EARN_COLOR,
    }
  }
  return {
    title: 'คุณใช้แต้ม',
    delta: `-${formatMemberPointsDisplay(used)} แต้ม`,
    deltaColor: USE_COLOR,
  }
}

export function buildMemberPointLineFlexMessage(params: {
  earned: number
  used: number
  balanceAfter: number
  tierCode?: string
  storeCode?: string
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

  const altParts = [greeting, headline.title, headline.delta, `คงเหลือ ${balance} แต้ม`].filter(Boolean)
  const altText = `${BRAND_NAME}: ${altParts.join(' · ')}`.slice(0, 400)

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
      spacing: 'sm',
      contents: [
        flexText({
          text: greeting,
          size: 'sm',
          color: TEXT_TITLE,
        }),
        flexText({
          text: headline.title,
          size: 'md',
          weight: 'bold',
          color: TEXT_TITLE,
          margin: 'xs',
        }),
        flexText({
          text: headline.delta,
          size: 'xxl',
          weight: 'bold',
          color: headline.deltaColor,
          margin: 'md',
        }),
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          margin: 'lg',
          contents: [
            flexText({ text: 'เหตุผล', size: 'sm', color: TEXT_MUTED, flex: 2 }),
            flexText({ text: reason, size: 'sm', color: TEXT_MUTED, flex: 5, wrap: true }),
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          margin: 'sm',
          contents: [
            flexText({ text: 'แต้มคงเหลือ', size: 'sm', color: TEXT_MUTED, flex: 2 }),
            flexText({
              text: `${balance} แต้ม`,
              size: 'sm',
              weight: 'bold',
              color: TEXT_BALANCE,
              flex: 5,
            }),
          ],
        },
      ],
      paddingAll: '20px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        flexText({
          text: `ขอบคุณที่ใช้บริการ ${BRAND_NAME} 🍗`,
          size: 'xs',
          color: TEXT_FOOTER,
          wrap: true,
        }),
        flexText({
          text: stamp,
          size: 'xxs',
          color: TEXT_FOOTER,
        }),
      ],
      backgroundColor: FOOTER_BG,
      paddingAll: '12px',
    },
  }

  return { altText, contents: bubble }
}
