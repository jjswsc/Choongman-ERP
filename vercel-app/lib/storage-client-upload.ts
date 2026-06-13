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
  options?: { upsert?: boolean; cacheControl?: string; timeoutMs?: number; onProgress?: (pct: number) => void }
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 120000
  const onProgress = options?.onProgress

  if (onProgress && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const timer = setTimeout(() => {
        xhr.abort()
        reject(new Error('Upload timeout'))
      }, timeoutMs)
      xhr.open('PUT', signedUrl)
      const contentType =
        file instanceof Blob && file.type && file.type.length > 0 ? file.type : 'application/octet-stream'
      xhr.setRequestHeader('Content-Type', contentType)
      if (options?.upsert) xhr.setRequestHeader('x-upsert', 'true')
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)))
        }
      }
      xhr.onload = () => {
        clearTimeout(timer)
        resolve(
          new Response(xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText,
          })
        )
      }
      xhr.onerror = () => {
        clearTimeout(timer)
        reject(new Error('Upload failed'))
      }
      xhr.onabort = () => {
        clearTimeout(timer)
        reject(new Error('Upload aborted'))
      }
      xhr.send(file)
    })
  }

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
