import { supabaseSelectFilter, supabaseUpdateByFilter } from "@/lib/supabase-server"

type AllocatorParams = {
  optionId: string | number
  preferredCode?: string | null
  fallbackSortOrder?: number | null
}

type AllocatorResult = {
  optionCode: string
  remapped: boolean
}

function normalizeCode(value: unknown): string {
  return String(value ?? "").trim()
}

function normalizeId(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.trunc(n)
}

function toFallbackMenuCode(menuId: number): string {
  return `M${Math.max(1, Math.trunc(menuId))}`
}

function parseSuffix(code: string, menuCode: string): number | null {
  const match = code.match(/^(.+)-(\d+)$/)
  if (!match) return null
  const prefix = String(match[1] ?? "").trim().toLowerCase()
  const target = menuCode.trim().toLowerCase()
  if (!prefix || !target || prefix !== target) return null
  const suffix = Number(match[2])
  if (!Number.isFinite(suffix) || suffix <= 0) return null
  return Math.trunc(suffix)
}

function buildCode(menuCode: string, suffix: number): string {
  return `${menuCode}-${Math.max(1, Math.trunc(suffix))}`
}

function pickPreferredCandidate(menuCode: string, preferredCode: string): string {
  const raw = normalizeCode(preferredCode)
  if (!raw) return ""
  const parsedSuffix = raw.match(/-(\d+)$/)
  if (!parsedSuffix) return ""
  const suffix = Number(parsedSuffix[1])
  if (!Number.isFinite(suffix) || suffix <= 0) return ""
  return buildCode(menuCode, suffix)
}

function nextAvailableCode(menuCode: string, takenLower: Set<string>, startSuffix: number): string {
  let suffix = Math.max(1, Math.trunc(startSuffix))
  while (true) {
    const nextCode = buildCode(menuCode, suffix)
    if (!takenLower.has(nextCode.toLowerCase())) return nextCode
    suffix += 1
  }
}

export async function createMenuOptionCodeAllocator(menuIdInput: number) {
  const menuId = normalizeId(menuIdInput)
  const codeById = new Map<number, string>()
  const takenLower = new Set<string>()
  let menuCode = toFallbackMenuCode(menuId || 1)

  if (menuId > 0) {
    try {
      const menuRows = (await supabaseSelectFilter("pos_menus", `id=eq.${menuId}`, {
        limit: 1,
        select: "id,code",
      })) as { id?: number; code?: string }[] | null
      const resolved = normalizeCode(menuRows?.[0]?.code)
      if (resolved) menuCode = resolved
    } catch {
      // fallback menu code 유지
    }

    try {
      const rows = (await supabaseSelectFilter("pos_menu_options", `menu_id=eq.${menuId}`, {
        limit: 5000,
        select: "id,option_code",
      })) as { id?: number; option_code?: string | null }[] | null
      for (const row of rows || []) {
        const id = normalizeId(row.id)
        const code = normalizeCode(row.option_code)
        if (!id || !code) continue
        codeById.set(id, code)
        takenLower.add(code.toLowerCase())
      }
    } catch {
      // 스키마 미배포/조회 실패 시 빈 상태에서 재생성
    }
  }

  return {
    async assign(params: AllocatorParams): Promise<AllocatorResult> {
      const optionId = normalizeId(params.optionId)
      if (!menuId || !optionId) return { optionCode: "", remapped: false }
      const existingCode = normalizeCode(codeById.get(optionId))
      if (existingCode) {
        takenLower.delete(existingCode.toLowerCase())
      }

      const preferred = pickPreferredCandidate(menuCode, normalizeCode(params.preferredCode))
      const fallbackSuffixRaw = Number(params.fallbackSortOrder ?? -1)
      const fallbackSuffix = Number.isFinite(fallbackSuffixRaw) && fallbackSuffixRaw >= 0
        ? Math.trunc(fallbackSuffixRaw) + 1
        : 1
      let nextCode = ""

      if (preferred && !takenLower.has(preferred.toLowerCase())) {
        nextCode = preferred
      } else if (existingCode && !takenLower.has(existingCode.toLowerCase())) {
        nextCode = existingCode
      } else {
        const preferredSuffix = parseSuffix(preferred, menuCode)
        nextCode = nextAvailableCode(
          menuCode,
          takenLower,
          preferredSuffix != null ? preferredSuffix : fallbackSuffix
        )
      }

      if (nextCode) {
        await supabaseUpdateByFilter("pos_menu_options", `id=eq.${optionId}`, { option_code: nextCode })
      }
      if (nextCode) {
        codeById.set(optionId, nextCode)
        takenLower.add(nextCode.toLowerCase())
      }

      const normalizedPreferred = normalizeCode(params.preferredCode)
      const preferredCanonical = pickPreferredCandidate(menuCode, normalizedPreferred)
      const remapped = !!normalizedPreferred && !!nextCode && preferredCanonical !== nextCode
      return { optionCode: nextCode, remapped }
    },
  }
}
