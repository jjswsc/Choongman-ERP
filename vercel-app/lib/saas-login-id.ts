/** SaaS 로그인 식별자(대리점 ID · 로그인 회사 · 로그인 이름) — 띄어쓰기 없이 소문자 */

const LOGIN_ID_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/

/** 입력 중: 공백 제거(붙여쓰기), 허용 문자만, 소문자 */
export function sanitizeSaasLoginIdTyping(raw: string): string {
  return String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase()
}

/** 저장·비교용 정규화. `JR Inter` → `jrinter`. 비면 "" */
export function normalizeSaasLoginId(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function isSaasLoginId(raw: string): boolean {
  const id = normalizeSaasLoginId(raw)
  return id.length >= 2 && id.length <= 40 && LOGIN_ID_RE.test(id)
}

/** 로그인 회사 비교: 대소문자·공백 무시, 하이픈 있어도 같게 (`JR Inter` = `jrinter` = `jr-inter`) */
export function saasLoginCompanyMatches(input: string, stored: string): boolean {
  const a = String(input || "").trim()
  const b = String(stored || "").trim()
  if (!a || !b) return false
  if (a.toLowerCase() === b.toLowerCase()) return true
  const sa = normalizeSaasLoginId(a)
  const sb = normalizeSaasLoginId(b)
  if (!sa || !sb) return false
  if (sa === sb) return true
  return sa.replace(/[-_]/g, "") === sb.replace(/[-_]/g, "")
}
