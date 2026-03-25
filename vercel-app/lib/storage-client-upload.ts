/**
 * 브라우저에서 Supabase Storage signed upload URL로 직접 PUT.
 * 파일 바이트는 Vercel을 거치지 않음.
 */
export async function putFileToSupabaseSignedUploadUrl(
  signedUrl: string,
  file: File | Blob,
  options?: { upsert?: boolean; cacheControl?: string }
): Promise<Response> {
  const fd = new FormData()
  fd.append('cacheControl', options?.cacheControl ?? '3600')
  fd.append('', file)
  return fetch(signedUrl, {
    method: 'PUT',
    body: fd,
    headers: {
      'x-upsert': String(options?.upsert ?? false),
    },
  })
}
