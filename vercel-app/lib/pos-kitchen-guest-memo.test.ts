import { describe, expect, it } from 'vitest'
import { formatGrabLineNoteForKitchenPrint } from './grab-pos-order-enrich'
import { splitKitchenGuestMemo, withKitchenGuestMemoSplit } from './pos-kitchen-guest-memo'
import { mapPosOrderRowForKitchenPrint } from './pos-kitchen-print-item-map'
import { mapKitchenSlipGroupItemsForPrint } from './pos-kitchen-slip-display'
import { buildKitchenSlipItemsHtml, resolveKitchenSlipDesign } from './pos-kitchen-slip-html'
import { preparePosOrderItemsForKitchenSlip } from './pos-kitchen-slip-routing'

const optionNameByCode = new Map([['C011-1', 'M - Boneless']])

function kitchenRowsText(
  raw: Record<string, unknown>[],
  settings: Parameters<typeof resolveKitchenSlipDesign>[0] = {}
): string[] {
  const prepared = preparePosOrderItemsForKitchenSlip(
    raw.map((it) => mapPosOrderRowForKitchenPrint(it)),
    {}
  )
  const lines = mapKitchenSlipGroupItemsForPrint(prepared, {
    orderItems: prepared,
    optionNameByCode,
    translateName: (n) => n,
    formatNote: (n) => formatGrabLineNoteForKitchenPrint(n, optionNameByCode) || undefined,
  })
  const html = buildKitchenSlipItemsHtml(
    lines,
    (s) => s,
    resolveKitchenSlipDesign(settings),
    '',
    optionNameByCode
  )
  return [...html.matchAll(/k-row-name">(.*?)<\/span>|k-line-note">(.*?)<\/div>/g)].map((m) =>
    m[1] ? `[${m[1]}]` : String(m[2])
  )
}

describe('splitKitchenGuestMemo', () => {
  it('QR 줄: 손님 메모와 태그·optc 토큰을 분리', () => {
    expect(
      splitKitchenGuestMemo({ source: 'qr_table', note: 'Buffet · เผ็ดน้อย · optc:C011-1' })
    ).toEqual({ note: 'Buffet · optc:C011-1', guestMemo: 'เผ็ดน้อย' })
  })

  it('POS·Grab 줄은 note 그대로', () => {
    expect(splitKitchenGuestMemo({ id: 'pos-1', note: 'no kimchi' })).toEqual({
      note: 'no kimchi',
      guestMemo: '',
    })
  })

  it('이미 분리된 줄은 이후 주입된 옵션 note 를 메모로 다시 떼지 않음', () => {
    const once = withKitchenGuestMemoSplit({ id: 'qr-1', source: 'qr_table', note: '' })
    const injected = { ...once, note: 'M - Boneless' }
    expect(withKitchenGuestMemoSplit(injected)).toBe(injected)
    expect(splitKitchenGuestMemo(injected).guestMemo).toBe('')
  })
})

describe('주방 슬립 — QR 손님 메모', () => {
  const qrWithMemo = {
    id: 'qr-1-a',
    name: 'Yangnyeom Chicken (M - Boneless)',
    qty: 1,
    note: 'เผ็ดน้อย',
    source: 'qr_table',
  }

  it('메모가 있어도 이름 괄호 옵션이 빠지지 않음', () => {
    expect(kitchenRowsText([qrWithMemo])).toEqual(['[Yangnyeom Chicken]', '- M - Boneless', '- เผ็ดน้อย'])
  })

  it('기타 옵션 인쇄를 꺼도 손님 메모는 인쇄', () => {
    expect(
      kitchenRowsText([qrWithMemo], { kitchenSlipOptionGroupPrint: { option: false } })
    ).toContain('- เผ็ดน้อย')
  })

  it('메뉴명이 들어간 메모도 숨기지 않음', () => {
    expect(
      kitchenRowsText([{ id: 'qr-1-c', name: 'Coke', qty: 1, note: 'Coke no ice', source: 'qr_table' }])
    ).toEqual(['[Coke]', '- Coke no ice'])
  })

  it('메뉴별 메모 인쇄를 끄면 손님 메모도 숨김', () => {
    expect(kitchenRowsText([qrWithMemo], { kitchenSlipShowLineNotes: false })).not.toContain('- เผ็ดน้อย')
  })

  it('메모 없는 QR 줄은 옵션이 한 번만 찍힘', () => {
    expect(
      kitchenRowsText([
        { id: 'qr-1-d', name: 'Fried Chicken (M - Boneless)', qty: 1, source: 'qr_table' },
      ])
    ).toEqual(['[Fried Chicken]', '- M - Boneless'])
  })

  it('POS 줄 note 는 기존처럼 옵션 그룹 설정을 따름', () => {
    expect(
      kitchenRowsText([{ id: 'pos-1', name: 'Fried Chicken', qty: 1, note: 'no kimchi' }], {
        kitchenSlipOptionGroupPrint: { sidedish: false },
      })
    ).toEqual(['[Fried Chicken]'])
  })
})
