/**
 * `/_next/static` JS·CSS는 파일 해시가 곧 내용이다.
 * HTML 오류 페이지·JSON을 같은 URL로 캐시하면 SyntaxError·ChunkLoadError가 난다.
 */
export function isCacheableNextStaticAssetResponse(response: {
  ok?: boolean
  status?: number
  headers?: { get(name: string): string | null }
} | null | undefined): boolean {
  if (!response) return false
  const status = Number(response.status)
  const ok = response.ok === true || status === 200
  if (!ok || status !== 200) return false
  const ct = String(response.headers?.get("content-type") || "").toLowerCase()
  if (ct.includes("html") || ct.includes("json") || ct.includes("text/plain")) return false
  if (ct.includes("javascript") || ct.includes("ecmascript")) return true
  if (ct.includes("css")) return true
  // Vercel이 Content-Type을 비우거나 octet-stream으로 주는 해시 자산
  return ct === "" || ct.includes("octet-stream")
}
