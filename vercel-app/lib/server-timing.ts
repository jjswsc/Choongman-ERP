/** API 단계별 소요 시간 → `Server-Timing` 헤더 (브라우저 DevTools·Vercel 로그에서 병목 확인용) */
export interface ServerTiming {
  /** 직전 mark(또는 시작) 이후 경과 시간을 name 단계로 누적 */
  mark: (name: string) => void
  totalMs: () => number
  header: () => string
  /** 응답 직전에 호출 — NextResponse.json 이 headers 를 복사하기 전에 넣어야 한다 */
  apply: (headers: Headers) => void
}

function toToken(name: string): string {
  const s = String(name || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32)
  return s || 'step'
}

export function createServerTiming(now: () => number = Date.now): ServerTiming {
  const startedAt = now()
  let last = startedAt
  const steps = new Map<string, number>()

  const mark = (name: string) => {
    const t = now()
    const key = toToken(name)
    steps.set(key, (steps.get(key) ?? 0) + Math.max(0, t - last))
    last = t
  }
  const totalMs = () => Math.max(0, now() - startedAt)
  const header = () => {
    const parts = [...steps].map(([k, v]) => `${k};dur=${Math.round(v)}`)
    parts.push(`total;dur=${Math.round(totalMs())}`)
    return parts.join(', ')
  }
  const apply = (headers: Headers) => {
    headers.set('Server-Timing', header())
  }
  return { mark, totalMs, header, apply }
}
