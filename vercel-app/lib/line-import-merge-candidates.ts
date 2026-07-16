import { canonicalMemberPhoneForStorage } from '@/lib/member-phone-lookup'

export type LineImportMergeCandidateMember = {
  id: number
  member_no?: string | null
  name?: string | null
  full_name?: string | null
  line_display_name?: string | null
  phone?: string | null
  birth_date?: string | null
  tier_code?: string | null
  point_balance?: number | null
  tier_points?: number | null
  source?: string | null
  hasLineIdentity?: boolean
}

export type LineImportMergeCandidate = {
  birthDate: string
  score: number
  reason: string
  targetId: number
  sourceId: number
  targetMemberNo: string
  sourceMemberNo: string
  targetPhone: string
  sourcePhone: string
  targetName: string
  sourceName: string
  targetPoints: number
  sourcePoints: number
  targetHasLine: boolean
  sourceHasLine: boolean
}

export const LINE_IMPORT_AUTO_MERGE_MIN_SCORE = 9

function toText(v: unknown): string {
  return String(v ?? '').trim()
}

function normalizeName(v: unknown): string {
  return toText(v).toLowerCase().replace(/\s+/g, ' ')
}

export function memberDisplayNames(member: LineImportMergeCandidateMember): string[] {
  const out = new Set<string>()
  for (const field of [member.name, member.full_name, member.line_display_name]) {
    const n = normalizeName(field)
    if (n) out.add(n)
  }
  return [...out]
}

function isValidThaiMobilePhone(phone: string): boolean {
  return /^0[689]\d{8}$/.test(phone)
}

export function namesLikelyRelated(
  a: LineImportMergeCandidateMember,
  b: LineImportMergeCandidateMember
): boolean {
  const na = memberDisplayNames(a)
  const nb = memberDisplayNames(b)
  for (const x of na) {
    for (const y of nb) {
      if (x === y) return true
      if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) return true
    }
  }
  return false
}

export function scoreLineImportBirthDuplicatePair(
  a: LineImportMergeCandidateMember,
  b: LineImportMergeCandidateMember
): { score: number; disqualified: boolean; reason: string } {
  const birth = toText(a.birth_date)
  if (!birth || birth !== toText(b.birth_date)) {
    return { score: 0, disqualified: true, reason: 'birth_mismatch' }
  }

  const phoneA = canonicalMemberPhoneForStorage(toText(a.phone))
  const phoneB = canonicalMemberPhoneForStorage(toText(b.phone))
  if (!isValidThaiMobilePhone(phoneA) || !isValidThaiMobilePhone(phoneB)) {
    return { score: 0, disqualified: true, reason: 'invalid_phone' }
  }
  if (phoneA === phoneB) {
    return { score: 0, disqualified: true, reason: 'same_phone' }
  }

  const lineA = Boolean(a.hasLineIdentity)
  const lineB = Boolean(b.hasLineIdentity)
  if (lineA && lineB) {
    return { score: 0, disqualified: true, reason: 'both_have_line' }
  }

  let score = 0
  const reasons: string[] = []

  if (toText(a.source) === 'line_import' && toText(b.source) === 'line_import') {
    score += 2
    reasons.push('both_line_import')
  }

  if (lineA || lineB) {
    score += 4
    reasons.push('one_line_identity')
  }

  if (namesLikelyRelated(a, b)) {
    score += 3
    reasons.push('names_related')
  } else if (lineA || lineB) {
    // 생년월일·LINE만 같고 이름이 다르면 다른 사람일 가능성 큼 (예: ก้องภพ vs Panita)
    return { score, disqualified: false, reason: `${reasons.join('+')}+review_only_no_name_match` }
  }

  return { score, disqualified: false, reason: reasons.join('+') || 'pair_ok' }
}

export function memberRankScore(member: LineImportMergeCandidateMember): number {
  return Number(member.point_balance || 0) * 1000 + Number(member.tier_points || 0)
}

/** 포인트·등급점수가 더 높은 쪽을 target(유지)으로 */
export function pickLineImportMergeTargetSource(
  a: LineImportMergeCandidateMember,
  b: LineImportMergeCandidateMember
): { target: LineImportMergeCandidateMember; source: LineImportMergeCandidateMember } {
  const rankA = memberRankScore(a)
  const rankB = memberRankScore(b)
  if (rankA !== rankB) {
    return rankA > rankB ? { target: a, source: b } : { target: b, source: a }
  }
  return a.id > b.id ? { target: a, source: b } : { target: b, source: a }
}

export function buildLineImportBirthDuplicateCandidates(
  members: LineImportMergeCandidateMember[],
  lineIdentityMemberIds: Set<number>,
  options?: { minScore?: number; pairOnly?: boolean }
): LineImportMergeCandidate[] {
  const minScore = options?.minScore ?? 0
  const pairOnly = options?.pairOnly !== false
  const withMeta = members.map((m) => ({
    ...m,
    hasLineIdentity: lineIdentityMemberIds.has(m.id),
  }))

  const byBirth = new Map<string, LineImportMergeCandidateMember[]>()
  for (const m of withMeta) {
    const birth = toText(m.birth_date)
    if (!birth) continue
    if (!byBirth.has(birth)) byBirth.set(birth, [])
    byBirth.get(birth)!.push(m)
  }

  const out: LineImportMergeCandidate[] = []
  for (const [birthDate, group] of byBirth.entries()) {
    if (pairOnly && group.length !== 2) continue
    if (group.length < 2) continue

    if (pairOnly) {
      const [a, b] = group
      const scored = scoreLineImportBirthDuplicatePair(a, b)
      if (scored.disqualified || scored.score < minScore) continue
      const { target, source } = pickLineImportMergeTargetSource(a, b)
      out.push(toCandidate(birthDate, scored.score, scored.reason, target, source))
      continue
    }

    // 3+ 그룹은 스크립트에서 pairOnly=true만 사용 (안전)
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!
        const b = group[j]!
        const scored = scoreLineImportBirthDuplicatePair(a, b)
        if (scored.disqualified || scored.score < minScore) continue
        const { target, source } = pickLineImportMergeTargetSource(a, b)
        out.push(toCandidate(birthDate, scored.score, scored.reason, target, source))
      }
    }
  }

  out.sort((x, y) => y.score - x.score || x.birthDate.localeCompare(y.birthDate))
  return out
}

function toCandidate(
  birthDate: string,
  score: number,
  reason: string,
  target: LineImportMergeCandidateMember,
  source: LineImportMergeCandidateMember
): LineImportMergeCandidate {
  return {
    birthDate,
    score,
    reason,
    targetId: target.id,
    sourceId: source.id,
    targetMemberNo: toText(target.member_no),
    sourceMemberNo: toText(source.member_no),
    targetPhone: canonicalMemberPhoneForStorage(toText(target.phone)),
    sourcePhone: canonicalMemberPhoneForStorage(toText(source.phone)),
    targetName: toText(target.full_name) || toText(target.name) || toText(target.line_display_name),
    sourceName: toText(source.full_name) || toText(source.name) || toText(source.line_display_name),
    targetPoints: Number(target.point_balance || 0),
    sourcePoints: Number(source.point_balance || 0),
    targetHasLine: Boolean(target.hasLineIdentity),
    sourceHasLine: Boolean(source.hasLineIdentity),
  }
}

export function dedupeMergeJobs(
  candidates: LineImportMergeCandidate[]
): LineImportMergeCandidate[] {
  const seen = new Set<string>()
  const out: LineImportMergeCandidate[] = []
  for (const c of candidates) {
    const key = [Math.min(c.targetId, c.sourceId), Math.max(c.targetId, c.sourceId)].join(':')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}
