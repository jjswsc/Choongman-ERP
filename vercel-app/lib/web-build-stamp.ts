/** HTML·현재 문서에서 빌드 공통 webpack 청크만 뽑는다. 페이지 전용 청크는 비교하지 않는다. */
export function extractSharedNextBuildStamp(source: string): string {
  const text = String(source || "")
  const webpack = text.match(/\/_next\/static\/chunks\/webpack[^"'\\\s?]*/)
  return webpack?.[0] || ""
}

export function currentDocumentNextBuildStamp(
  doc: { querySelectorAll: (selector: string) => ArrayLike<{ getAttribute(name: string): string | null }> } | null | undefined
): string {
  if (!doc) return ""
  const parts: string[] = []
  const nodes = doc.querySelectorAll("script[src], link[href]")
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]
    const v = el.getAttribute("src") || el.getAttribute("href") || ""
    if (v.includes("/_next/static/")) parts.push(v)
  }
  return extractSharedNextBuildStamp(parts.join("\n"))
}

export function shouldReloadForNewWebBuild(currentStamp: string, networkStamp: string): boolean {
  return Boolean(currentStamp && networkStamp && currentStamp !== networkStamp)
}
