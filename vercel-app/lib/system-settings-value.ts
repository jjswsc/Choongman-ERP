/** system_settings.value_json — 문자열·불리언 등을 안전하게 읽기 */
export function readSystemSettingString(raw: unknown): string {
  if (typeof raw === 'boolean') return raw ? 'true' : 'false'
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  if (typeof raw === 'string') return raw.replace(/^"|"$/g, '').trim()
  return ''
}

/** URL·단순 문자열 설정 저장용 value_json */
export function writeSystemSettingString(raw: unknown): string {
  return readSystemSettingString(raw)
}
