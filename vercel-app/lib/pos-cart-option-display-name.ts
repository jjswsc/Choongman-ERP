import type { PosMenu, PosMenuOption } from '@/lib/api-client'
import {
  inferChickenOptionPartValue,
  inferChickenOptionSizeValue,
  isChickenMenuCodeForOptions,
} from '@/lib/pos-chicken-option-inference'
import { isPosCartOptionLabelMatchPickerEnabled } from '@/lib/pos-cart-option-label-rollout'

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
 * 옵션 피커에서 고른 행들의 표시명을 장바구니 괄호·인쇄용 문자열로 합친다.
 * (다단계 part+sidedish 등 — 단계 값 Boneless 대신 행 name M - Boneless 사용)
 */
export function composePosCartOptionBracketFromPickerRows(
  menu: Pick<PosMenu, 'optionSelectionGroups' | 'code'>,
  rows: PosMenuOption[],
  storeCode?: string | null
): string {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const label = resolvePosCartOptionDisplayName(menu, row, storeCode)
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(label)
  }
  return labels.join(' - ')
}

/**
 * 장바구니·영수증 괄호 안에 넣을 옵션 표시명.
 * POS 옵션 버튼(translateChickenPartLabel)과 동일 소스 — 인쇄 시 translatePosMenuLineForReceipt 적용.
 */
export function resolvePosCartOptionDisplayName(
  menu: Pick<PosMenu, 'optionSelectionGroups' | 'code'>,
  opt: PosMenuOption,
  storeCode?: string | null
): string {
  const usePickerLabelRollout = isPosCartOptionLabelMatchPickerEnabled(storeCode)
  const raw = String(opt.name ?? '').trim()
  const groups = (menu.optionSelectionGroups ?? []).map((g) => String(g ?? '').trim()).filter(Boolean)
  const step =
    opt.optionStepValues && typeof opt.optionStepValues === 'object' && !Array.isArray(opt.optionStepValues)
      ? opt.optionStepValues
      : null

  let resolved = raw
  if (step && groups.length > 0) {
    const orderedVals = groups.map((g) => String(step[g] ?? '').trim()).filter((s) => s !== '')
    const composed = orderedVals.join(' - ')
    if (composed) {
      const sizeKey = groups.find((g) => g.toLowerCase() === 'size')
      const sizeVal = sizeKey ? String(step[sizeKey] ?? '').trim() : ''
      if (sizeVal && !optionStepValueAppearsAsTokenInDisplay(raw, sizeVal)) {
        resolved = composed
      } else {
        resolved = raw || composed
      }
    }
  }

  if (usePickerLabelRollout && isChickenMenuCodeForOptions(menu.code)) {
    const size = inferChickenOptionSizeValue(opt)
    const part = inferChickenOptionPartValue(opt)
    if (size && part && !optionStepValueAppearsAsTokenInDisplay(resolved, size)) {
      return `${size} - ${part}`
    }
  }

  return resolved
}
