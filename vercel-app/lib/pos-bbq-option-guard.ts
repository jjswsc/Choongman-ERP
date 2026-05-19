const BBQ_CHICKEN_CODES = new Set(['c020', 'c021', 'c022', 'c023'])

export function isStrictBonelessBbqChickenCode(code: string | null | undefined): boolean {
  return BBQ_CHICKEN_CODES.has(String(code ?? '').trim().toLowerCase())
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

