import { apiFetch } from './fetch'

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
  return res.json() as Promise<{
    success: boolean
    message?: string
    storeName?: string
    userName?: string
    role?: string
    token?: string
    employeeId?: number
    employeeCode?: string
    allowedStores?: string[]
  }>
}

export async function changePassword(params: {
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
  return res.json() as Promise<{ success: boolean; message?: string }>
}
