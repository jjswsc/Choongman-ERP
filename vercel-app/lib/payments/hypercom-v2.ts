import { createCipheriv, createDecipheriv, createECDH } from 'node:crypto'

type FieldTuple = { type: string; data: string }

const STX = 0x02
const ETX = 0x03
const FS = 0x1c

export function toAsciiBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'ascii'))
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex').toUpperCase()
}

export function fromHex(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex.replace(/\s+/g, ''), 'hex'))
}

export function calcLrc(bytes: Uint8Array): number {
  let lrc = 0
  for (const b of bytes) lrc ^= b
  return lrc & 0xff
}

function bcdLength4(n: number): Uint8Array {
  const s = String(Math.max(0, n)).padStart(4, '0')
  return new Uint8Array([
    Number.parseInt(s.slice(0, 2), 10),
    Number.parseInt(s.slice(2, 4), 10),
  ])
}

function writeField(field: FieldTuple): Uint8Array {
  const t = field.type.padEnd(2, ' ').slice(0, 2)
  const data = field.data ?? ''
  const dataBytes = toAsciiBytes(data)
  const len = bcdLength4(dataBytes.length)
  const out = new Uint8Array(2 + 2 + dataBytes.length + 1)
  out.set(toAsciiBytes(t), 0)
  out.set(len, 2)
  out.set(dataBytes, 4)
  out[out.length - 1] = FS
  return out
}

function concatBytes(...arr: Uint8Array[]): Uint8Array {
  const total = arr.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arr) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

export function buildHypercomV1Frame(opts: {
  txCode: string
  reqResIndicator?: '0' | '1' | '2'
  responseCode?: string
  moreIndicator?: '0' | '1'
  fields: FieldTuple[]
  formatVersion?: '1' | '2'
}): Uint8Array {
  const transportHeader = '6000000000'
  const formatVersion = opts.formatVersion ?? '1'
  const rr = opts.reqResIndicator ?? '0'
  const tx = opts.txCode.padEnd(2, ' ').slice(0, 2)
  const rc = (opts.responseCode ?? '00').padEnd(2, ' ').slice(0, 2)
  const more = opts.moreIndicator ?? '0'
  const presentation = `${formatVersion}${rr}${tx}${rc}${more}`
  const payloadFields = concatBytes(...opts.fields.map(writeField))
  const messageData = concatBytes(
    toAsciiBytes(transportHeader),
    toAsciiBytes(presentation),
    new Uint8Array([FS]),
    payloadFields
  )
  const lengthBcd = bcdLength4(messageData.length)
  const startToEtx = concatBytes(
    new Uint8Array([STX]),
    lengthBcd,
    messageData,
    new Uint8Array([ETX])
  )
  const lrc = calcLrc(startToEtx)
  return concatBytes(startToEtx, new Uint8Array([lrc]))
}

export function parseHypercomFrame(frame: Uint8Array): {
  responseCode: string
  txCode: string
  fields: Record<string, string>
} {
  if (frame.length < 8) throw new Error('frame_too_short')
  if (frame[0] !== STX) throw new Error('invalid_stx')
  const etxIndex = frame.lastIndexOf(ETX)
  if (etxIndex < 0 || etxIndex >= frame.length - 1) throw new Error('invalid_etx')
  const lrc = frame[etxIndex + 1]
  const check = calcLrc(frame.slice(0, etxIndex + 1))
  if (lrc !== check) throw new Error('invalid_lrc')
  const body = frame.slice(3, etxIndex)
  if (body.length < 16) throw new Error('invalid_body')
  const txCode = Buffer.from(body.slice(11, 13)).toString('ascii')
  const responseCode = Buffer.from(body.slice(13, 15)).toString('ascii')
  const fsIndex = body.indexOf(FS, 0)
  const fieldsRaw = fsIndex >= 0 ? body.slice(fsIndex + 1) : new Uint8Array()
  const fields: Record<string, string> = {}
  let i = 0
  while (i + 5 <= fieldsRaw.length) {
    if (fieldsRaw[i] === FS) {
      i += 1
      continue
    }
    const type = Buffer.from(fieldsRaw.slice(i, i + 2)).toString('ascii')
    const lenHi = fieldsRaw[i + 2]
    const lenLo = fieldsRaw[i + 3]
    const len = (Math.floor(lenHi / 16) * 10 + (lenHi % 16)) * 100
      + Math.floor(lenLo / 16) * 10 + (lenLo % 16)
    i += 4
    const data = Buffer.from(fieldsRaw.slice(i, i + len)).toString('ascii')
    fields[type] = data
    i += len
    if (fieldsRaw[i] === FS) i += 1
  }
  return { txCode, responseCode, fields }
}

export function buildEncryptedPmFrame(base64Payload: string): Uint8Array {
  return buildHypercomV1Frame({
    txCode: '20',
    reqResIndicator: '0',
    responseCode: '00',
    moreIndicator: '0',
    formatVersion: '2',
    fields: [{ type: 'PM', data: base64Payload }],
  })
}

export function generateEcdhKeyPairBase64(): { publicKeyBase64: string; privateKeyHex: string } {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  return {
    publicKeyBase64: ecdh.getPublicKey(undefined, 'compressed').toString('base64'),
    privateKeyHex: ecdh.getPrivateKey().toString('hex'),
  }
}

export function deriveEcdhSecretHex(privateKeyHex: string, remotePublicKeyBase64: string): string {
  const ecdh = createECDH('prime256v1')
  ecdh.setPrivateKey(Buffer.from(privateKeyHex, 'hex'))
  const secret = ecdh.computeSecret(Buffer.from(remotePublicKeyBase64, 'base64'))
  return secret.toString('hex').toUpperCase()
}

export function computeIvFromSecret(secret: Uint8Array): Uint8Array {
  const out = new Uint8Array(secret.length)
  for (let i = 0; i < secret.length; i += 1) {
    // KBTG 문서 샘플 수식 기반.
    out[i] = (secret[i] + ((2 ^ i) + 1)) & 0xff
  }
  return out
}

export function encryptPayloadGcmBase64(payload: Uint8Array, secretHex: string): string {
  const key = Buffer.from(secretHex, 'hex').subarray(0, 32)
  const iv = Buffer.from(computeIvFromSecret(new Uint8Array(Buffer.from(secretHex, 'hex')))).subarray(0, 12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(Buffer.from(payload)), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([encrypted, tag]).toString('base64')
}

export function decryptPayloadGcmBase64(base64Payload: string, secretHex: string): Uint8Array {
  const key = Buffer.from(secretHex, 'hex').subarray(0, 32)
  const iv = Buffer.from(computeIvFromSecret(new Uint8Array(Buffer.from(secretHex, 'hex')))).subarray(0, 12)
  const raw = Buffer.from(base64Payload, 'base64')
  if (raw.length < 16) throw new Error('invalid_encrypted_payload')
  const data = raw.subarray(0, raw.length - 16)
  const tag = raw.subarray(raw.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return new Uint8Array(Buffer.concat([decipher.update(data), decipher.final()]))
}
