import { gunzipSync, inflateSync } from 'zlib'

/** PostgREST gzip/deflate 응답 → UTF-8 JSON 문자열 (비즈니스 로직 변경 없음) */
export function decodeHttpResponseBody(raw: Buffer, contentEncoding: string | undefined): string {
  const enc = String(contentEncoding || '')
    .toLowerCase()
    .split(',')[0]
    ?.trim()
  if (enc === 'gzip') return gunzipSync(raw).toString('utf8')
  if (enc === 'deflate') return inflateSync(raw).toString('utf8')
  return raw.toString('utf8')
}
