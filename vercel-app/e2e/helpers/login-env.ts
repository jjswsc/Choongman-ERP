/** E2E 로그인 테스트 계정 — 미설정 시 auth spec skip */
export type E2EAdminLoginEnv = {
  store: string
  user: string
  password: string
}

export function readE2EAdminLoginEnv(): E2EAdminLoginEnv | null {
  const store = process.env.E2E_ADMIN_STORE?.trim()
  const user = process.env.E2E_ADMIN_USER?.trim()
  const password = process.env.E2E_ADMIN_PASSWORD
  if (!store || !user || !password) return null
  return { store, user, password }
}

export function hasE2EAdminLoginEnv(): boolean {
  return readE2EAdminLoginEnv() !== null
}
