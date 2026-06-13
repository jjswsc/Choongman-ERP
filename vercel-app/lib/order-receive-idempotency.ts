import { createHash } from 'node:crypto'

export type OrderReceiveIdempotencyInput = {
  orderId: number
  isPartialReceive: boolean
  inspectedIndices: number[]
  receivedQtys: Record<string | number, number> | null | undefined
  receiveYmd: string
}

/** 동일 발주·동일 수령 줄·동일 일자 → 오프라인 큐 재전송·연타 시 서버 중복 차단 */
export function buildOrderReceiveCanonicalKey(input: OrderReceiveIdempotencyInput): string {
  const indices = [...(input.inspectedIndices || [])]
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b)
  const qtyParts: string[] = []
  const raw = input.receivedQtys
  if (raw && typeof raw === 'object') {
    const keys = Object.keys(raw)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
    for (const k of keys) {
      const v = raw[k] ?? raw[String(k)]
      qtyParts.push(`${k}:${Math.floor(Number(v) || 0)}`)
    }
  }
  const payload = [
    input.orderId,
    input.isPartialReceive ? '1' : '0',
    indices.join(','),
    qtyParts.join(','),
    String(input.receiveYmd || '').trim().slice(0, 10),
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

export function resolveOrderReceiveIdempotencyKey(params: {
  orderId: number
  clientKey?: string | null
  isPartialReceive: boolean
  inspectedIndices: number[]
  receivedQtys: Record<string | number, number> | null | undefined
  receiveYmd: string
}): string {
  const client = String(params.clientKey || '').trim()
  if (client) return client.slice(0, 200)
  return buildOrderReceiveCanonicalKey({
    orderId: params.orderId,
    isPartialReceive: params.isPartialReceive,
    inspectedIndices: params.inspectedIndices,
    receivedQtys: params.receivedQtys,
    receiveYmd: params.receiveYmd,
  })
}
