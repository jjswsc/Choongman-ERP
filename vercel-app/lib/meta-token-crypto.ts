import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

function keyBuf(): Buffer {
  const raw =
    String(process.env.META_TOKEN_ENCRYPTION_KEY || process.env.META_APP_SECRET || "cm-erp-meta-token-dev").trim()
  return createHash("sha256").update(raw).digest()
}

export function encryptMetaToken(plain: string): string {
  const text = String(plain || "")
  if (!text) return ""
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyBuf(), iv)
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString("base64")
}

export function decryptMetaToken(payload: string): string {
  const raw = String(payload || "").trim()
  if (!raw) return ""
  try {
    const buf = Buffer.from(raw, "base64")
    if (buf.length < 29) return ""
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const data = buf.subarray(28)
    const decipher = createDecipheriv("aes-256-gcm", keyBuf(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
  } catch {
    return ""
  }
}
