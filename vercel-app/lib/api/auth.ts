import { apiFetch } from './fetch'

export async function getLoginData() {
  const res = await apiFetch('/api/getLoginData')
  const data = (await res.json()) as {
    users?: Record<string, string[]>
    vendors?: string[]
    error?: string
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
