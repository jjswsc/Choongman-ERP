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

    it('주방 코드 접두 [C024]는 표시하지 않고 맛만 분리한다', () => {
      const html = formatKitchenSlipItemRowHtml(
        { name: '[C024] Banban Chicken (Flavor 1 / Flavor 2)', qty: 1 },
        noEsc,
        close
      )
      expect(html).toContain('Banban Chicken')
      expect(html).not.toContain('[C024]')
      expect(html).not.toContain('Banban Chicken (Flavor 1')
      expect(html).toContain('- Flavor 1')
      expect(html).toContain('- Flavor 2')
    })

    it('메뉴 코드만 이름에 있으면 note에서 본문을 복원한다', () => {
      const html = formatKitchenSlipItemRowHtml(
        {
          name: 'C024',
          qty: 1,
          note: 'Banban Chicken (CHEESE TORNADO, SWEET YANGNYEOM, Kimchi) x1',
        },
        noEsc,
        close
      )
      expect(html).toContain('Banban Chicken')
      expect(html).not.toContain('>C024<')
      expect(html).not.toContain('×C024')
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

    it('옵션 문자열이 하이픈으로 연결돼도 옵션별 한 줄로 출력한다', () => {
      const html = formatKitchenSlipItemRowHtml(
        { name: 'SOY SAUCE CHICKEN (Boneless - Pickled Radish)', qty: 1 },
        noEsc,
        close
      )
      expect(html).toContain('- Boneless')
      expect(html).toContain('- Pickled Radish')
      expect(html).not.toContain('- Boneless - Pickled Radish')
    })

    it('사이즈 접두 옵션은 한 줄로 유지한다', () => {
      const html = formatKitchenSlipItemRowHtml(
        { name: 'SPICY YANGNYEOM (M - Drumette)', qty: 1 },
        noEsc,
        close
      )
      expect(html).toContain('- M - Drumette')
      expect(html).not.toContain('<br/>- Drumette')
    })

    it('세트 구성품은 홀 주문서처럼 들여쓴 줄로 표시한다', () => {
      const html = formatKitchenSlipItemRowHtml(
        {
          name: '[April] Set 1',
          qty: 1,
          promoComposeLines: ['Rice x1', 'GOLDEN FRIED CHICKEN (S Boneless) x1'],
        },
        noEsc,
        close
      )
      expect(html).toContain('Set 1')
      expect(html).toContain('- Rice x1')
      expect(html).toContain('- GOLDEN FRIED CHICKEN (S Boneless) x1')
      expect(html).not.toContain('[Set 1] GOLDEN')
    })

    it('잘못 들어온 Size 라벨을 메뉴명으로 출력하지 않고 note의 메뉴명으로 복구한다', () => {
      const html = formatKitchenSlipItemRowHtml(
        {
          name: 'Size S',
          qty: 1,
          note: 'SOY SAUCE CHICKEN (Boneless - Pickled Radish) x1',
        },
        noEsc,
        close
      )
      expect(html).toContain('SOY SAUCE CHICKEN')
      expect(html).not.toContain('>Size S<')
      expect(html).not.toContain('- SOY SAUCE CHICKEN (Boneless - Pickled Radish) x1')
    })

    it('코드만 찍힌 메뉴는 note의 메뉴명으로 복구해 코드 본문을 숨긴다', () => {
      const html = formatKitchenSlipItemRowHtml(
        {
          name: '[C006] C006',
          qty: 1,
          note: '- CURRYCANE (S Boneless) x1',
        },
        noEsc,
        close
      )
      expect(html).toContain('CURRYCANE')
      expect(html).not.toContain('>C006<')
      expect(html).toContain('- S Boneless')
      expect(html).not.toContain('- CURRYCANE (S Boneless) x1')
    })

    it('브래킷 없는 코드 메뉴명도 note에서 복구한다', () => {
      const html = formatKitchenSlipItemRowHtml(
        {
          name: 'C010',
          qty: 1,
          note: '- SOY SAUCE CHICKEN (S Boneless) x1',
        },
        noEsc,
        close
      )
      expect(html).toContain('SOY SAUCE CHICKEN')
      expect(html).not.toContain('>C010<')
      expect(html).toContain('- S Boneless')
    })

    it('Size 라벨 행은 note 선두 메뉴명으로 복구하고 잘못된 Size 본문 노출을 막는다', () => {
      const html = formatKitchenSlipItemRowHtml(
        {
          name: 'Size S',
          qty: 1,
          note: 'SOY SAUCE CHICKEN (Boneless - Pickled Radish) x1 · Size M',
        },
        noEsc,
        close
      )
      expect(html).toContain('SOY SAUCE CHICKEN')
      expect(html).toContain('- Boneless')
      expect(html).toContain('- Pickled Radish')
      expect(html).not.toContain('>Size S<')
    })
  })
})
