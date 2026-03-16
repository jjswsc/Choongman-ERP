type OaPlusRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
}

function toText(v: unknown): string {
  return String(v || '').trim()
}

export function getOaPlusBaseUrl(): string {
  return toText(process.env.OAPLUS_API_BASE_URL) || 'https://developers-oaplus.line.biz'
}

function getOaPlusApiKey(): string {
  return toText(process.env.OAPLUS_API_KEY)
}

function buildUrl(path: string, query?: OaPlusRequestOptions['query']): string {
  const base = getOaPlusBaseUrl().replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(base + normalizedPath)
  for (const [k, v] of Object.entries(query || {})) {
    if (v == null) continue
    url.searchParams.set(k, String(v))
  }
  return url.toString()
}

export async function oaPlusFetch(path: string, options?: OaPlusRequestOptions) {
  const apiKey = getOaPlusApiKey()
  if (!apiKey) {
    throw new Error('OAPLUS_API_KEY가 설정되지 않았습니다.')
  }

  const method = options?.method || 'GET'
  const hasBody = options?.body != null && method !== 'GET'
  const url = buildUrl(path, options?.query)
  const res = await fetch(url, {
    method,
    headers: {
      'X-API-KEY': apiKey,
      'User-Agent': 'Choongman-ERP',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(options?.body) : undefined,
    cache: 'no-store',
  })

  const text = await res.text().catch(() => '')
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }

  return {
    ok: res.ok,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    data: json,
  }
}
