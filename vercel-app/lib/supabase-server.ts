/**
 * Supabase REST - 서버 전용 (Next.js API routes)
 */
function getConfig() {
  const url = (process.env.SUPABASE_URL || '').trim()
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('SUPABASE_URL 또는 SUPABASE_ANON_KEY가 없습니다.')
  const base = url.replace(/\/$/, '').replace(/^http:\/\//, 'https://')
  return { url: base, key }
}

export async function supabaseSelect(
  table: string,
  options: { order?: string; limit?: number; offset?: number } = {}
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const query = ['select=*']
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
  options: { order?: string; limit?: number } = {}
) {
  const { url, key } = getConfig()
  const pathStr = `${url}/rest/v1/${encodeURIComponent(table)}`
  const query = ['select=*', filter]
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
