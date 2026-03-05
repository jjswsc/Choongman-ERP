/**
 * Supabase REST - 서버 전용 (Next.js API routes)
 *
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY(권장) 또는 SUPABASE_ANON_KEY 환경 변수 필요.
 * service_role은 RLS를 우회하여 안전한 서버 전용 접근. anon은 RLS 적용됨.
 * API 라우트(app/api/*) 내부에서만 import. 클라이언트 번들에 포함되지 않도록.
 */
function getConfig() {
  const url = (process.env.SUPABASE_URL || '').trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim()
  const key = serviceKey || anonKey
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY(권장) 또는 SUPABASE_ANON_KEY가 필요합니다. ' +
        '보안을 위해 service_role 키 사용을 권장합니다.'
    )
  }
  const base = url.replace(/\/$/, '').replace(/^http:\/\//, 'https://')
  return { url: base, key }
}

export async function supabaseSelect(
  table: string,
  options: { order?: string; limit?: number; offset?: number; select?: string } = {}
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const query = [options.select ? `select=${encodeURIComponent(options.select)}` : 'select=*']
  if (options.order) query.push(`order=${encodeURIComponent(options.order)}`)
  if (options.limit != null) query.push(`limit=${Number(options.limit)}`)
  if (options.offset != null) query.push(`offset=${Number(options.offset)}`)
  const rangeEnd = options.limit != null ? Number(options.limit) - 1 : 1999
  const res = await fetch(pathStr + '?' + query.join('&'), {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `0-${rangeEnd}`,
    },
  })
  if (!res.ok) throw new Error('Supabase select failed: ' + (await res.text()))
  return res.json()
}

export async function supabaseInsert(table: string, row: Record<string, unknown>) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const res = await fetch(pathStr, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  if (!res.ok) throw new Error('Supabase insert failed: ' + (await res.text()))
  const text = await res.text()
  return text ? (JSON.parse(text) as unknown) : []
}

export async function supabaseUpdate(
  table: string,
  id: string | number,
  patch: Record<string, unknown>
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(String(id))}`
  const res = await fetch(pathStr, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error('Supabase update failed: ' + (await res.text()))
  return true
}
export async function supabaseSelectFilter(
  table: string,
  filter: string,
  options: { order?: string; limit?: number; select?: string } = {}
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const query = [options.select ? `select=${encodeURIComponent(options.select)}` : 'select=*', filter]
  if (options.order) query.push(`order=${encodeURIComponent(options.order)}`)
  if (options.limit != null) query.push(`limit=${Number(options.limit)}`)
  const rangeEnd = (options.limit != null ? Number(options.limit) : 2000) - 1
  const res = await fetch(pathStr + '?' + query.join('&'), {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `0-${rangeEnd}`,
    },
  })
  if (!res.ok) throw new Error('Supabase select failed: ' + (await res.text()))
  return res.json()
}

export async function supabaseUpdateByFilter(
  table: string,
  filter: string,
  patch: Record<string, unknown>
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?${filter}`
  const res = await fetch(pathStr, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error('Supabase update by filter failed: ' + (await res.text()))
  return true
}

export async function supabaseDeleteByFilter(
  table: string,
  filter: string
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?${filter}`
  const res = await fetch(pathStr, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  if (!res.ok) throw new Error('Supabase delete failed: ' + (await res.text()))
  return true
}

/**
 * count만 필요할 때 사용. PostgREST Prefer: count=exact + Range: 0-0 으로
 * 실제 row는 거의 가져오지 않고 Content-Range 헤더에서 total count 반환.
 * egress 최소화용.
 */
export async function supabaseCountFilter(table: string, filter: string): Promise<number> {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?select=id&${filter}`
  const res = await fetch(pathStr, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  if (!res.ok) throw new Error('Supabase count failed: ' + (await res.text()))
  const range = res.headers.get('Content-Range')
  if (range) {
    const match = range.match(/\/(\d+)$/)
    if (match) return parseInt(match[1], 10)
  }
  return 0
}

export async function supabaseInsertMany(table: string, rows: Record<string, unknown>[]) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const res = await fetch(pathStr, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error('Supabase insert many failed: ' + (await res.text()))
  const text = await res.text()
  return text ? (JSON.parse(text) as unknown) : []
}

/**
 * Storage: 파일 업로드
 * path 예: "projectId/filename.pdf"
 * @returns object path (bucket/objectPath)
 */
export async function supabaseStorageUpload(
  bucket: string,
  path: string,
  body: Blob | ArrayBuffer,
  options?: { contentType?: string; upsert?: boolean }
): Promise<{ key: string; publicUrl: string }> {
  const { url, key } = getConfig()
  const base = url.replace(/\/$/, '')
  const apiPath = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map((p) => encodeURIComponent(p)).join('/')}`

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': options?.contentType || 'application/octet-stream',
  }
  if (options?.upsert) {
    headers['x-upsert'] = 'true'
  }

  const res = await fetch(apiPath, {
    method: 'POST',
    headers,
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error('Supabase storage upload failed: ' + text)
  }
  const json = (await res.json()) as { Key?: string }
  const objectKey = json.Key || `${bucket}/${path}`
  const publicUrl = `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path}`
  return { key: objectKey, publicUrl }
}

/**
 * Storage: 객체 삭제
 * path 예: "projectId/filename.pdf"
 */
export async function supabaseStorageDelete(bucket: string, path: string): Promise<void> {
  const { url, key } = getConfig()
  const base = url.replace(/\/$/, '')
  const apiPath = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map((p) => encodeURIComponent(p)).join('/')}`

  const res = await fetch(apiPath, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error('Supabase storage delete failed: ' + text)
  }
}

/** UPSERT: 충돌 시 기존 행 갱신. onConflict 예: "month,store,name" */
export async function supabaseUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(onConflict)}`
  const res = await fetch(pathStr, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error('Supabase upsert failed: ' + (await res.text()))
  const text = await res.text()
  return text ? (JSON.parse(text) as unknown) : []
}
