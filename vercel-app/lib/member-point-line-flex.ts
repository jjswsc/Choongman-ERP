import { formatMemberPointsDisplay } from '@/lib/member-points-math'

const BRAND_NAME = 'Choongman Chicken'
const BRAND_GREEN = '#1B7F4B'
const TEXT_MUTED = '#6B7280'
const TEXT_DARK = '#111827'
const EARN_COLOR = '#059669'
const USE_COLOR = '#DC2626'

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

type FlexBox = {
  type: 'box'
  layout: 'vertical' | 'horizontal' | 'baseline'
  contents: Array<FlexBox | FlexText | { type: 'separator'; margin?: string; color?: string }>
  spacing?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
  margin?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
  paddingAll?: string
  backgroundColor?: string
  cornerRadius?: string
  flex?: number
}

function flexText(partial: Omit<FlexText, 'type'> & { type?: 'text' }): FlexText {
  return { type: 'text', wrap: true, ...partial }
}

function detailRow(label: string, value: string): FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      flexText({ text: label, size: 'sm', color: TEXT_MUTED, flex: 2 }),
      flexText({ text: value, size: 'sm', color: TEXT_DARK, align: 'end', flex: 3, weight: 'bold' }),
    ],
  }
}

function resolveHeadline(params: { earned: number; used: number }): { title: string; delta: string; deltaColor: string } {
  const earned = Number(params.earned || 0)
  const used = Number(params.used || 0)
  if (earned > 0 && used > 0) {
    return {
      title: 'อัปเดตพอยท์',
      delta: `+${formatMemberPointsDisplay(earned)} / -${formatMemberPointsDisplay(used)}`,
      deltaColor: TEXT_DARK,
    }
  }
  if (earned > 0) {
    return {
      title: 'ได้รับพอยท์',
      delta: `+${formatMemberPointsDisplay(earned)}`,
      deltaColor: EARN_COLOR,
    }
  }
  return {
    title: 'ใช้พอยท์แล้ว',
    delta: `-${formatMemberPointsDisplay(used)}`,
    deltaColor: USE_COLOR,
  }
}

export function buildMemberPointLineFlexMessage(params: {
  earned: number
  used: number
  balanceAfter: number
  tierCode: string
  storeCode?: string
  orderNo?: string
}): { altText: string; contents: Record<string, unknown> } {
  const headline = resolveHeadline(params)
  const tier = String(params.tierCode || '').trim() || '-'
  const storeCode = String(params.storeCode || '').trim()
  const orderNo = String(params.orderNo || '').trim()
  const balance = formatMemberPointsDisplay(params.balanceAfter)

  const bodyRows: FlexBox['contents'] = [
    detailRow('พอยท์คงเหลือ', `${balance} P`),
    detailRow('ระดับสมาชิก', tier),
  ]
  if (storeCode) bodyRows.push(detailRow('สาขา', storeCode))
  if (orderNo) bodyRows.push(detailRow('ออเดอร์', orderNo))

  const altParts = [headline.title, headline.delta, `คงเหลือ ${balance}`].filter(Boolean)
  const altText = `${BRAND_NAME}: ${altParts.join(' · ')}`.slice(0, 400)

  const bubble: Record<string, unknown> = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        flexText({
          text: BRAND_NAME,
          weight: 'bold',
          size: 'sm',
          color: '#FFFFFF',
        }),
        flexText({
          text: headline.title,
          weight: 'bold',
          size: 'lg',
          color: '#FFFFFF',
          margin: 'sm',
        }),
      ],
      backgroundColor: BRAND_GREEN,
      paddingAll: '16px',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          contents: [
            flexText({
              text: 'พอยท์อัปเดต',
              size: 'xs',
              color: TEXT_MUTED,
              align: 'center',
            }),
            flexText({
              text: headline.delta,
              size: '3xl',
              weight: 'bold',
              color: headline.deltaColor,
              align: 'center',
              margin: 'sm',
            }),
          ],
          paddingAll: '12px',
          backgroundColor: '#F9FAFB',
          cornerRadius: '12px',
        },
        {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: bodyRows,
        },
      ],
      paddingAll: '16px',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        flexText({
          text: 'ขอบคุณที่ใช้บริการ Choongman Chicken',
          size: 'xxs',
          color: TEXT_MUTED,
          align: 'center',
        }),
      ],
      paddingAll: '12px',
    },
  }

  return { altText, contents: bubble }
}
