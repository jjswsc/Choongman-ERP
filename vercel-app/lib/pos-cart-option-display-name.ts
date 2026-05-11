import type { PosMenu, PosMenuOption } from '@/lib/api-client'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 단계 값(S/M/L·부위명 등)이 옵션 표시 문자열에 토큰 단위로 포함되는지 */
export function optionStepValueAppearsAsTokenInDisplay(raw: string, value: string): boolean {
  const r = String(raw ?? '').trim()
  const v = String(value ?? '').trim()
  if (!v) return true
  if (!r) return false
  // 한 글자 사이즈는 단어 경계 대신 구분자·문장 경계로만 인식(예: Boneless 안의 M 오인식 방지)
  if (/^[SML]$/i.test(v)) {
    return new RegExp(`(^|[\\s\\-–—])${escapeRegExp(v)}([\\s\\-–—]|$)`, 'i').test(r)
  }
  return new RegExp(`(^|[\\s\\-–—])${escapeRegExp(v)}([\\s\\-–—]|$)`, 'i').test(r)
}

/**
 * 장바구니·영수증 괄호 안에 넣을 옵션 표시명.
 * `option_step_values`에 사이즈가 있는데 `name`에만 부위가 있는 레거시 행에서 사이즈가 빠지지 않게 한다.
 */
export function resolvePosCartOptionDisplayName(menu: PosMenu, opt: PosMenuOption): string {
  const raw = String(opt.name ?? '').trim()
  const groups = (menu.optionSelectionGroups ?? []).map((g) => String(g ?? '').trim()).filter(Boolean)
  const step =
    opt.optionStepValues && typeof opt.optionStepValues === 'object' && !Array.isArray(opt.optionStepValues)
      ? opt.optionStepValues
      : null
  if (!step || groups.length === 0) return raw

  const orderedVals = groups.map((g) => String(step[g] ?? '').trim()).filter((s) => s !== '')
  const composed = orderedVals.join(' - ')
  if (!composed) return raw

  const sizeKey = groups.find((g) => g.toLowerCase() === 'size')
  const sizeVal = sizeKey ? String(step[sizeKey] ?? '').trim() : ''
  if (sizeVal && !optionStepValueAppearsAsTokenInDisplay(raw, sizeVal)) {
    return composed
  }
  return raw || composed
}
