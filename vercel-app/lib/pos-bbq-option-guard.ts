const BBQ_CHICKEN_CODES = new Set(['c020', 'c021', 'c022', 'c023'])

/** Bar.B.Q M 사이즈는 플랫 목록으로 — 다단계 size/part 단계는 금지 */
export const BBQ_FORBIDDEN_SELECTION_GROUP_KEYS = new Set(['size', 'part'])

export function isStrictBonelessBbqChickenCode(code: string | null | undefined): boolean {
  return BBQ_CHICKEN_CODES.has(String(code ?? '').trim().toLowerCase())
}

/** C020~C023: sidedish 등 부가 단계만 허용, size/part 키 제거 */
export function normalizeBbqChickenOptionSelectionGroups(groups: string[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const x of groups || []) {
    const k = String(x ?? '').trim()
    if (!k || seen.has(k)) continue
    if (BBQ_FORBIDDEN_SELECTION_GROUP_KEYS.has(k.toLowerCase())) continue
    seen.add(k)
    keys.push(k)
  }
  return keys
}

export function validateBbqOptionSelectionGroups(
  menuCode: string | null | undefined,
  groups: string[] | null | undefined
): { ok: true } | { ok: false; message: string } {
  if (!isStrictBonelessBbqChickenCode(menuCode)) return { ok: true }
  const forbidden = (groups || []).filter((g) =>
    BBQ_FORBIDDEN_SELECTION_GROUP_KEYS.has(String(g ?? '').trim().toLowerCase())
  )
  if (forbidden.length === 0) return { ok: true }
  return {
    ok: false,
    message:
      'Bar.B.Q 치킨(C020~C023)에는 size/part 선택 단계를 쓸 수 없습니다. M-Boneless 목록은 유지하고, 치킨무·김치 등은 sidedish 같은 부가 단계·공통 옵션 그룹으로 추가해 주세요.',
  }
}

export function validateStrictBonelessBbqOption(params: {
  menuCode: string | null | undefined
  optionType: string | null | undefined
  optionName: string | null | undefined
  optionStepValues?: Record<string, string> | null
}): { ok: true } | { ok: false; message: string } {
  if (!isStrictBonelessBbqChickenCode(params.menuCode)) return { ok: true }
  const optionType = String(params.optionType ?? 'substitution').trim().toLowerCase()
  if (optionType !== 'substitution') return { ok: true }

  const name = String(params.optionName ?? '').trim()
  if (!name) return { ok: true }
  const n = name.toLowerCase()

  if (/(wing|drumette|윙|봉)/i.test(n)) {
    return {
      ok: false,
      message:
        'BBQ 치킨(C020~C023)은 Boneless만 허용됩니다. Wing/Drumette 옵션은 저장할 수 없습니다.',
    }
  }

  if (/^\s*m\b/i.test(name) && !/^m\s*[-–—]?\s*boneless\s*$/i.test(name)) {
    return {
      ok: false,
      message:
        'BBQ 치킨(C020~C023) M 옵션은 "M - Boneless"만 허용됩니다.',
    }
  }

  const part = String(params.optionStepValues?.part ?? '').trim().toLowerCase()
  if (part && part !== 'boneless') {
    return {
      ok: false,
      message:
        'BBQ 치킨(C020~C023)은 option_step_values.part=Boneless만 허용됩니다.',
    }
  }

  return { ok: true }
}
