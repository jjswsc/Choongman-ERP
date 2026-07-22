import { describe, expect, it } from 'vitest'

/** 순수 로직 단위 테스트 — 서버 DB 조회 없이 충돌/할당만 검증 */
function allocateSeq(opts: {
  selfSeq: number | null
  usedByOthers: number[]
}): number {
  const used = new Set(opts.usedByOthers)
  if (opts.selfSeq != null && !used.has(opts.selfSeq)) return opts.selfSeq
  const maxSeq = used.size > 0 ? Math.max(...used) : 0
  const ceiling =
    opts.selfSeq != null && used.has(opts.selfSeq)
      ? Math.max(maxSeq, opts.selfSeq)
      : maxSeq
  return ceiling + 1
}

describe('tax invoice deposit seq (issueDate global)', () => {
  it('reuses own seq when unique', () => {
    expect(allocateSeq({ selfSeq: 3, usedByOthers: [1, 2] })).toBe(3)
  })

  it('allocates max+1 when no self', () => {
    expect(allocateSeq({ selfSeq: null, usedByOthers: [1, 2] })).toBe(3)
    expect(allocateSeq({ selfSeq: null, usedByOthers: [] })).toBe(1)
  })

  it('reallocates when self seq collides with another source', () => {
    // 두 건 모두 -001로 저장된 상태 → 새 순번 2
    expect(allocateSeq({ selfSeq: 1, usedByOthers: [1] })).toBe(2)
  })
})
