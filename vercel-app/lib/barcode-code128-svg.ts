/**
 * Code128B 바코드 → inline SVG data URI
 * 외부 네트워크(quickchart.io) 의존 제거 → 영수증 인쇄 속도 개선
 *
 * Code128B: ASCII 32–127 전 문자 지원(숫자·영문·특수문자 혼합 OK)
 */

// Code128B 패턴: bar/space 폭 시퀀스. 0=space, 1=bar
const CODE128B_PATTERNS: number[][] = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1,2],
]

const START_B = 104
const STOP = 106

function encodeCode128B(text: string): number[] {
  const codes: number[] = [START_B]
  let checksum = START_B
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32
    if (code < 0 || code > 94) continue // skip non-Code128B chars
    codes.push(code)
    checksum += code * (i + 1)
  }
  codes.push(checksum % 103)
  codes.push(STOP)
  return codes
}

/**
 * Code128B 바코드를 SVG data URI로 반환.
 * barHeight: 바 높이(px), scale: 모듈(가장 좁은 바) 폭(px)
 */
export function buildCode128SvgDataUri(
  text: string,
  opts?: { barHeight?: number; scale?: number; includeText?: boolean }
): string {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const barHeight = opts?.barHeight ?? 38
  const scale = opts?.scale ?? 2
  const includeText = opts?.includeText ?? true

  const codes = encodeCode128B(raw)
  // 각 코드의 패턴을 bar 배열로 변환
  const bars: { x: number; w: number }[] = []
  let x = 0
  const quietZone = 10 * scale
  x = quietZone
  for (const code of codes) {
    const pattern = CODE128B_PATTERNS[code]
    if (!pattern) continue
    for (let p = 0; p < pattern.length; p++) {
      const w = pattern[p] * scale
      if (p % 2 === 0) {
        // bar (even index = bar)
        bars.push({ x, w })
      }
      x += w
    }
  }
  const totalWidth = x + quietZone
  const textHeight = includeText ? 14 : 0
  const svgHeight = barHeight + textHeight + 4

  let rects = ''
  for (const b of bars) {
    rects += `<rect x="${b.x}" y="0" width="${b.w}" height="${barHeight}" fill="#000"/>`
  }
  const textEl = includeText
    ? `<text x="${totalWidth / 2}" y="${barHeight + textHeight}" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">${escSvg(raw)}</text>`
    : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${svgHeight}" viewBox="0 0 ${totalWidth} ${svgHeight}">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    rects +
    textEl +
    `</svg>`

  return `data:image/svg+xml;base64,${btoa(svg)}`
}

function escSvg(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
