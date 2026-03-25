/**
 * OAPlus Public API (developers-oaplus.line.biz) 공통 요청 헤더.
 * @see https://developers-oaplus.line.biz — X-API-KEY, (선택) User-Agent
 */

export function getOaplusRequestHeaders(
  apiKey: string,
  opts?: { contentTypeJson?: boolean }
): Record<string, string> {
  const h: Record<string, string> = {
    'X-API-KEY': apiKey,
    Accept: 'application/json',
  }
  const ua = String(process.env.LINE_OAPLUS_USER_AGENT || 'CM-ERP OAPlus').trim()
  if (ua) {
    h['User-Agent'] = ua
  }
  if (opts?.contentTypeJson) {
    h['Content-Type'] = 'application/json'
  }
  return h
}
