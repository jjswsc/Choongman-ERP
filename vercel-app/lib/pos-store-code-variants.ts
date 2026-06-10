/** POS store_code 문자열 변형 — 클라이언트·서버 공통(순수 함수). */

export function addPosStoreCodeVariants(set: Set<string>, raw: string) {
  const v = String(raw || '').trim()
  if (!v || v.toLowerCase() === 'all') return
  set.add(v)
  const partnerStripped = v.replace(/^partner\s*store\s*id\s*[-:]\s*/i, '').trim()
  if (partnerStripped && partnerStripped !== v) set.add(partnerStripped)
  const numeric = (partnerStripped || v).match(/\b(\d{3,6})\b/)?.[1] || ''
  if (numeric) set.add(numeric)
  const prefixed = v.startsWith('CM ') ? v.slice(3).trim() : `CM ${v}`.trim()
  if (prefixed && prefixed !== v) set.add(prefixed)
  const noPrefix = v.replace(/^CM\s+/i, '').trim()
  if (noPrefix && noPrefix !== v) set.add(noPrefix)
}
