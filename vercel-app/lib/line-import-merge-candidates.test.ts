import { describe, expect, it } from 'vitest'
import {
  LINE_IMPORT_AUTO_MERGE_MIN_SCORE,
  buildLineImportBirthDuplicateCandidates,
  namesLikelyRelated,
  pickLineImportMergeTargetSource,
  scoreLineImportBirthDuplicatePair,
} from '@/lib/line-import-merge-candidates'

describe('line-import-merge-candidates', () => {
  const kongTarget = {
    id: 10850,
    member_no: 'M010850',
    name: 'Kongpop',
    phone: '0967185451',
    birth_date: '2002-10-11',
    point_balance: 150,
    tier_points: 151,
    source: 'line_import',
    hasLineIdentity: false,
  }
  const kongSource = {
    id: 11578,
    member_no: 'M011578',
    name: 'ก้องภพ',
    phone: '0946387882',
    birth_date: '2002-10-11',
    point_balance: 30,
    tier_points: 30,
    source: 'line_import',
    hasLineIdentity: true,
  }

  it('scores Kongphop-style pair below auto threshold without name match', () => {
    const scored = scoreLineImportBirthDuplicatePair(kongTarget, kongSource)
    expect(scored.disqualified).toBe(false)
    expect(scored.score).toBeLessThan(LINE_IMPORT_AUTO_MERGE_MIN_SCORE)
    expect(scored.reason).toContain('review_only_no_name_match')
  })

  it('disqualifies when both have LINE', () => {
    const scored = scoreLineImportBirthDuplicatePair(
      { ...kongTarget, hasLineIdentity: true },
      { ...kongSource, hasLineIdentity: true }
    )
    expect(scored.disqualified).toBe(true)
  })

  it('picks higher points as target', () => {
    const picked = pickLineImportMergeTargetSource(kongTarget, kongSource)
    expect(picked.target.id).toBe(10850)
    expect(picked.source.id).toBe(11578)
  })

  it('detects related names', () => {
    expect(namesLikelyRelated({ name: 'Kongpop' }, { line_display_name: 'Kongpop' })).toBe(true)
  })

  it('builds auto candidate only when names match', () => {
    const lineIds = new Set<number>([11578])
    const withNames = buildLineImportBirthDuplicateCandidates(
      [
        { ...kongTarget, name: 'Kongpop', line_display_name: 'Kongpop' },
        { ...kongSource, name: 'Kongpop', line_display_name: 'Kongpop' },
      ],
      lineIds,
      { minScore: LINE_IMPORT_AUTO_MERGE_MIN_SCORE, pairOnly: true }
    )
    expect(withNames).toHaveLength(1)

    const withoutNames = buildLineImportBirthDuplicateCandidates(
      [kongTarget, kongSource],
      lineIds,
      { minScore: LINE_IMPORT_AUTO_MERGE_MIN_SCORE, pairOnly: true }
    )
    expect(withoutNames).toHaveLength(0)
  })
})
