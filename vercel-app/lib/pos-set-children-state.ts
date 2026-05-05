export type PosSetChildState = {
  servedAt?: string | null
  servedBy?: string | null
  packedAt?: string | null
  packedBy?: string | null
}

export type PosSetChildrenState = Record<string, PosSetChildState>

export type PosSetChildLine = {
  menuId?: string | null
  optionId?: string | null
}

export function buildPosSetChildKey(line: PosSetChildLine, idx: number, unitIndex = 0): string {
  const menu = String(line.menuId ?? '').trim() || '-'
  const option = String(line.optionId ?? '').trim() || '-'
  return `${menu}:${option}:${Math.max(0, Math.trunc(idx))}:${Math.max(0, Math.trunc(unitIndex))}`
}

export function listPosSetChildKeys(
  lines: Array<{ menuId?: string | null; optionId?: string | null; quantity?: number }>
): string[] {
  const out: string[] = []
  lines.forEach((line, idx) => {
    const qty = Math.max(1, Math.trunc(Number(line.quantity ?? 1) || 1))
    for (let n = 0; n < qty; n += 1) out.push(buildPosSetChildKey(line, idx, n))
  })
  return out
}

export function readPosSetChildrenState(raw: unknown): PosSetChildrenState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const src = raw as Record<string, unknown>
  const out: PosSetChildrenState = {}
  for (const [key, val] of Object.entries(src)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue
    const row = val as Record<string, unknown>
    out[key] = {
      servedAt: typeof row.servedAt === 'string' ? row.servedAt : null,
      servedBy: typeof row.servedBy === 'string' ? row.servedBy : null,
      packedAt: typeof row.packedAt === 'string' ? row.packedAt : null,
      packedBy: typeof row.packedBy === 'string' ? row.packedBy : null,
    }
  }
  return out
}
