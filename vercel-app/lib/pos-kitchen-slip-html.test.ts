import { describe, expect, it } from 'vitest'
import { formatKitchenSlipItemRowHtml, localizeKitchenSlipLineNote } from './pos-kitchen-slip-html'

describe('pos-kitchen-slip-html', () => {
  describe('localizeKitchenSlipLineNote', () => {
    it('치킨 부위 선택값을 영어로 치환한다', () => {
      const note = '(S ไม่มีกระดูก) · (M - โดบา) · (M - ปีก)'
      const localized = localizeKitchenSlipLineNote(note)
      expect(localized).toContain('(S Boneless)')
      expect(localized).toContain('(M - Drumette)')
      expect(localized).toContain('(M - Joint wing)')
    })

    it('기존 영어 표기는 유지한다', () => {
      const note = '(M - Joint wing)'
      const localized = localizeKitchenSlipLineNote(note)
      expect(localized).toBe('(M - Joint wing)')
    })
  })

  describe('formatKitchenSlipItemRowHtml — Banban', () => {
    const close = (tag: string) => '</' + tag + '>'
    const noEsc = (s: string) => s

    it('반반 메뉴는 두 가지 맛을 별도 줄로 보여준다', () => {
      const html = formatKitchenSlipItemRowHtml(
        { name: 'Banban Chicken (GUCHUJANG / CHEESE TORNADO)', qty: 1 },
        noEsc,
        close
      )
      expect(html).toContain('Banban Chicken')
      expect(html).not.toContain('Banban Chicken (GUCHUJANG')
      expect(html).toContain('- GUCHUJANG')
      expect(html).toContain('- CHEESE TORNADO')
    })

    it('주방 코드 접두 [C024]가 있어도 맛을 분리한다', () => {
      const html = formatKitchenSlipItemRowHtml(
        { name: '[C024] Banban Chicken (Flavor 1 / Flavor 2)', qty: 1 },
        noEsc,
        close
      )
      expect(html).toContain('[C024] Banban Chicken')
      expect(html).not.toContain('Banban Chicken (Flavor 1')
      expect(html).toContain('- Flavor 1')
      expect(html).toContain('- Flavor 2')
    })

    it('일반 옵션 메뉴는 영향을 받지 않는다', () => {
      const html = formatKitchenSlipItemRowHtml(
        { name: 'Chicken (M - Boneless)', qty: 2 },
        noEsc,
        close
      )
      expect(html).toContain('Chicken')
      expect(html).toContain('- Boneless')
    })
  })
})
