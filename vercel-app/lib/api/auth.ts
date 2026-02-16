import { apiFetch } from './fetch'

export async function getLoginData() {
  const res = await apiFetch('/api/getLoginData')
  return res.json() as Promise<{ users: Record<string, string[]>; vendors: string[] }>
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
