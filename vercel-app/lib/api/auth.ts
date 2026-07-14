import { apiFetch } from './fetch'

/** 본문이 JSON이 아닐 때(502 HTML 등) 명시적 오류 */
async function readJsonOrThrow(res: Response, label: string): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) {
    throw new Error(`${label} (${res.status})`)
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(
      res.ok
        ? `${label}: 서버 응답 형식 오류`
        : `${label} 실패 (HTTP ${res.status})`
    )
  }
}

export async function getLoginData() {
  const res = await apiFetch('/api/getLoginData')
  let data: { users?: Record<string, string[]>; vendors?: string[]; error?: string }
  try {
    data = (await res.json()) as typeof data
  } catch {
    throw new Error(res.ok ? '응답 파싱 실패' : `서버 오류 (${res.status})`)
  }
  if (!res.ok && data?.error) throw new Error(data.error)
  if (!res.ok) throw new Error('매장 목록을 불러오지 못했습니다.')
  return { users: data.users ?? {}, vendors: data.vendors ?? [] }
}

export async function loginCheck(params: {
  company?: string
  store: string
  name: string
  pw: string
  isAdminPage?: boolean
}) {
  const res = await apiFetch('/api/loginCheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await readJsonOrThrow(res, 'loginCheck')) as {
    success: boolean
    message?: string
    companyName?: string
    tenantId?: string
    storeName?: string
    userName?: string
    role?: string
    token?: string
    employeeId?: number
    employeeCode?: string
    allowedStores?: string[]
    canManageOfficePayroll?: boolean
    saasPartnerLogin?: boolean
    code?: string
  }
  return data
}

export async function changePassword(params: {
  company?: string
  store: string
  name: string
  oldPw: string
  newPw: string
}) {
  const res = await apiFetch('/api/changePassword', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return (await readJsonOrThrow(res, 'changePassword')) as { success: boolean; message?: string }
}
