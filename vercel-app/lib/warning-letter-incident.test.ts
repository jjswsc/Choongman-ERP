import { describe, expect, it } from 'vitest'
import { evalIncidentRowHasUserContent, evalStoredIncidentRecordHasContent } from './warning-letter-incident'

describe('evalIncidentRowHasUserContent', () => {
  it('드롭다운만 eval_incident_1이면 false', () => {
    expect(
      evalIncidentRowHasUserContent({
        type: 'eval_incident_1',
        details: '',
        date: '',
        warningLetterChecked: false,
        warningLetterUrl: '',
      })
    ).toBe(false)
  })
  it('드롭다운 + 상세 있으면 true', () => {
    expect(
      evalIncidentRowHasUserContent({ type: 'eval_incident_1', details: '지각' })
    ).toBe(true)
  })
  it('경고 첨부 있으면 true', () => {
    expect(
      evalIncidentRowHasUserContent({ type: 'eval_incident_1', details: '', warningLetterUrl: 'data:,' })
    ).toBe(true)
  })
  it('기타 + typeOther', () => {
    expect(
      evalIncidentRowHasUserContent({ type: '__기타__', typeOther: '커스텀' })
    ).toBe(true)
  })
})

describe('evalStoredIncidentRecordHasContent', () => {
  it('api 레코드: eval_incident_2만 있으면 false', () => {
    expect(evalStoredIncidentRecordHasContent({ type: 'eval_incident_2', details: '' })).toBe(false)
  })
})
