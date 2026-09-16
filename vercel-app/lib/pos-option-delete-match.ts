export function isPersistedPosMenuOptionId(id: unknown): boolean {
  return /^\d+$/.test(String(id ?? ""))
}

export function isDraftPosMenuOptionId(id: unknown): boolean {
  return String(id ?? "").startsWith("draft-")
}

export type LinkedOptionGroupItemRef = { groupId: number; itemId: number }

export type OptionDeleteFingerprint = {
  id: string
  name: string
  stepValues: Record<string, string>
}

/** 그룹 링크 가상 행 id → 그룹 항목. `g12-i34` 또는 `m99-g12i34` / `m99-g12i34-g15i50` */
export function parsePosLinkedOptionGroupItemRefs(id: unknown): LinkedOptionGroupItemRef[] {
  const raw = String(id ?? "").trim()
  if (!raw || isPersistedPosMenuOptionId(raw) || isDraftPosMenuOptionId(raw)) return []
  const simple = raw.match(/^g(\d+)-i(\d+)$/)
  if (simple) {
    return [{ groupId: Number(simple[1]), itemId: Number(simple[2]) }]
  }
  const out: LinkedOptionGroupItemRef[] = []
  const re = /g(\d+)i(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    out.push({ groupId: Number(m[1]), itemId: Number(m[2]) })
  }
  return out
}

export function optionRowUsesLinkedGroupItem(
  optionId: unknown,
  ref: LinkedOptionGroupItemRef
): boolean {
  return parsePosLinkedOptionGroupItemRefs(optionId).some(
    (x) => x.groupId === ref.groupId && x.itemId === ref.itemId
  )
}

export function pickLinkedOptionGroupItemToDelete(
  optionId: unknown,
  groups: Array<{ id: string | number; key: string }>,
  selectedGroupKey: string | undefined
): LinkedOptionGroupItemRef | null {
  const refs = parsePosLinkedOptionGroupItemRefs(optionId)
  if (refs.length === 0) return null
  if (refs.length === 1) return refs[0]
  const key = String(selectedGroupKey ?? "").trim().toLowerCase()
  if (key && key !== "__default__") {
    const match = refs.find((r) =>
      groups.some(
        (g) => Number(g.id) === r.groupId && String(g.key ?? "").trim().toLowerCase() === key
      )
    )
    if (match) return match
  }
  return refs[refs.length - 1] ?? null
}

export function optionStepValuesRecord(
  option: { optionStepValues?: Record<string, string> | null } | null | undefined
): Record<string, string> {
  const sv = option?.optionStepValues
  if (!sv || typeof sv !== "object" || Array.isArray(sv)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(sv)) {
    const key = String(k ?? "").trim()
    const val = String(v ?? "").trim()
    if (key && val) out[key] = val
  }
  return out
}

export function fingerprintDeletedOption(option: {
  id?: string
  name?: string
  optionStepValues?: Record<string, string> | null
}): OptionDeleteFingerprint {
  return {
    id: String(option.id ?? "").trim(),
    name: String(option.name ?? "").trim(),
    stepValues: optionStepValuesRecord(option),
  }
}

export function optionMatchesDeleteFingerprint(
  option: { id?: string; name?: string; optionStepValues?: Record<string, string> | null },
  fp: OptionDeleteFingerprint
): boolean {
  const optionId = String(option.id ?? "").trim()
  if (fp.id && optionId === fp.id) return true
  const fpRefs = parsePosLinkedOptionGroupItemRefs(fp.id)
  if (fpRefs.some((ref) => optionRowUsesLinkedGroupItem(optionId, ref))) return true
  const sv = optionStepValuesRecord(option)
  const fpKeys = Object.keys(fp.stepValues)
  if (fpKeys.length === 1) {
    const k = fpKeys[0]
    if (String(sv[k] ?? "") === fp.stepValues[k]) return true
  }
  if (
    fpKeys.length > 1 &&
    Object.keys(sv).length === fpKeys.length &&
    fpKeys.every((k) => String(sv[k] ?? "") === fp.stepValues[k])
  ) {
    return true
  }
  const name = String(option.name ?? "").trim()
  return Boolean(name) && Boolean(fp.name) && name === fp.name && fpKeys.length <= 1
}

export function filterOptionsExcludingDeleted<
  T extends { id?: string; name?: string; optionStepValues?: Record<string, string> | null },
>(options: T[], deleted: OptionDeleteFingerprint[]): T[] {
  if (!deleted.length) return options
  return options.filter((o) => !deleted.some((fp) => optionMatchesDeleteFingerprint(o, fp)))
}
