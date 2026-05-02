import { describe, expect, it } from 'vitest'
import { localizeKitchenSlipLineNote } from './pos-kitchen-slip-html'

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
})
