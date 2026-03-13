import crypto from 'crypto'

export function createLineSignature(body: string, channelSecret: string): string {
  return crypto
    .createHmac('sha256', channelSecret)
    .update(body, 'utf8')
    .digest('base64')
}

export function verifyLineSignature(body: string, signature: string | null, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false
  const expected = createLineSignature(body, channelSecret)
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}
