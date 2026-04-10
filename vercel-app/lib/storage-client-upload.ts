/**
 * 브라우저에서 Supabase Storage signed upload URL로 직접 PUT.
 * 파일 바이트는 Vercel을 거치지 않음.
 *
 * Supabase signed upload는 본문을 raw 바이트로 기대한다. FormData(multipart)로 보내면
 * 일부 환경에서 응답 지연·실패가 날 수 있어 Blob/File을 그대로 PUT한다.
 */
export async function putFileToSupabaseSignedUploadUrl(
  signedUrl: string,
  file: File | Blob,
  options?: { upsert?: boolean; cacheControl?: string; timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 120000
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const contentType =
    file instanceof Blob && file.type && file.type.length > 0
      ? file.type
      : 'application/octet-stream'
  const headers: Record<string, string> = {
    'Content-Type': contentType,
  }
  if (options?.upsert) {
    headers['x-upsert'] = 'true'
  }
  try {
    return await fetch(signedUrl, {
      method: 'PUT',
      body: file,
      headers,
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}
