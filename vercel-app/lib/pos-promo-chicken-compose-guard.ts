import type { PosMenuOption } from '@/lib/api-client'
import {
  isChickenDefaultOptionName,
  isChickenMenuCodeForOptions,
} from '@/lib/pos-chicken-option-inference'

export type PromoComposeLineOptionRef = {
  menuId: string
  menuCode?: string | null
  menuName?: string | null
  optionId: string | null
  optionCode?: string | null
}

/** Wing·Drumette 등 세트 기본과 다른 치킨 부위 */
export function isNonPreferredChickenPartOptionName(name: string | undefined): boolean {
  const n = String(name ?? '').trim()
  if (!n) return false
  if (isChickenDefaultOptionName(n)) return false
  if (/boneless|순살/i.test(n)) return false
  return /drumette|wing|봉|윙|joint\s*wing|leg\b/i.test(n)
}

function isPreferredMBonelessOption(o: PosMenuOption): boolean {
  const name = String(o.name ?? '').trim()
  if (/^M\s*[-–—]?\s*Boneless\s*$/i.test(name)) return true
  const part = String(o.optionStepValues?.part ?? '').trim()
  const size = String(o.optionStepValues?.size ?? '').trim().toUpperCase()
  return part.toLowerCase() === 'boneless' && (!size || size === 'M')
}

/**
 * 세트 조합에 치킨을 넣을 때 자동 선택할 optionId.
 * M-Boneless 우선, 없으면 null(S Boneless). Wing/Drumette는 자동 선택하지 않음.
 */
export function resolvePreferredChickenSetOptionId(options: PosMenuOption[]): string | null {
  const pool = options.filter(
    (o) =>
      (o.optionType === 'substitution' || o.optionType == null) &&
      !isChickenDefaultOptionName(o.name)
  )
  if (pool.length === 0) return null

  const boneless = pool.find(isPreferredMBonelessOption)
  if (boneless?.id != null) return String(boneless.id)

  const nonPart = pool.filter((o) => !isNonPreferredChickenPartOptionName(o.name))
  if (nonPart.length === 1 && nonPart[0].id != null) return String(nonPart[0].id)

  return null
}

/** option_id + option_code 스냅샷으로 옵션 바인딩 복원·교정 */
export function resolvePromoItemOptionBinding(params: {
  menuId: string
  menuCode?: string | null
  optionId: string | null | undefined
  optionCode?: string | null | undefined
  allOptions: PosMenuOption[]
}): { optionId: string | null; optionLabel: string | null; corrected: boolean } {
  const menuId = String(params.menuId ?? '').trim()
  const menuOpts = params.allOptions.filter((o) => String(o.menuId ?? '') === menuId)
  const code = String(params.optionCode ?? '').trim()
  const id = params.optionId != null && String(params.optionId).trim() ? String(params.optionId).trim() : ''

  if (code) {
    const byCode = menuOpts.find((o) => String(o.optionCode ?? '').trim() === code)
    if (byCode) {
      const byCodeId = String(byCode.id ?? '').trim()
      const label = byCode.name?.trim() || null
      return {
        optionId: byCodeId || null,
        optionLabel: label,
        corrected: !!id && byCodeId !== id,
      }
    }
  }

  if (id) {
    const byId = menuOpts.find((o) => String(o.id) === id)
    if (byId) {
      return {
        optionId: id,
        optionLabel: byId.name?.trim() || null,
        corrected: false,
      }
    }
    if (isChickenMenuCodeForOptions(params.menuCode ?? undefined) && code) {
      return { optionId: null, optionLabel: null, corrected: true }
    }
  }

  if (isChickenMenuCodeForOptions(params.menuCode ?? undefined) && !id) {
    return { optionId: null, optionLabel: null, corrected: false }
  }

  return { optionId: id || null, optionLabel: null, corrected: false }
}

export function findNonPreferredChickenComposeLines(
  lines: PromoComposeLineOptionRef[],
  optionById: Map<string, PosMenuOption>
): Array<{ menuName: string; optionLabel: string }> {
  const out: Array<{ menuName: string; optionLabel: string }> = []
  for (const ln of lines) {
    if (!isChickenMenuCodeForOptions(ln.menuCode ?? undefined)) continue
    const opt = ln.optionId ? optionById.get(String(ln.optionId)) : null
    const label = opt?.name?.trim() || ''
    if (!label) continue
    if (isNonPreferredChickenPartOptionName(label)) {
      out.push({
        menuName: String(ln.menuName ?? ln.menuCode ?? ln.menuId).trim() || ln.menuId,
        optionLabel: label,
      })
    }
  }
  return out
}
