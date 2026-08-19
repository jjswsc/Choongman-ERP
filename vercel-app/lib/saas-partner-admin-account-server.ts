import "server-only"

import { hashPassword } from "./password"
import { isSaasLoginId, normalizeSaasLoginId } from "./saas-login-id"
import {
  resolveSaasPartnerLoginCompany,
  resolveSaasPartnerLoginStore,
} from "./saas-partner-login-defaults"
import { supabaseInsert, supabaseSelectFilter } from "./supabase-server"

export type SaasPartnerLoginAccount = {
  employeeId: number
  company: string
  store: string
  name: string
}

export async function createSaasPartnerAdminEmployee(params: {
  name: string
  password: string
  /** 로그인 회사 — 대리점 ID 슬러그 (`jrinter`) */
  company?: string
  store?: string
}): Promise<SaasPartnerLoginAccount> {
  const name = normalizeSaasLoginId(params.name)
  const rawPassword = String(params.password || "").trim()
  const company =
    normalizeSaasLoginId(params.company || "") || resolveSaasPartnerLoginCompany()
  const store = String(params.store || "").trim() || resolveSaasPartnerLoginStore()
  if (!isSaasLoginId(name)) {
    throw new Error("로그인 이름은 영문·숫자·하이픈만, 띄어쓰기 없이 입력해 주세요.")
  }
  if (!isSaasLoginId(company)) {
    throw new Error("로그인 회사(대리점 ID)는 영문·숫자·하이픈만, 띄어쓰기 없이 입력해 주세요.")
  }
  if (rawPassword.length < 4) {
    throw new Error("비밀번호는 4자 이상 입력해 주세요.")
  }

  const dup = (await supabaseSelectFilter(
    "employees",
    `company=eq.${encodeURIComponent(company)}&store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`,
    { limit: 1, select: "id" }
  )) as { id?: number }[]
  if ((dup || []).length > 0) {
    throw new Error("같은 회사·매장·이름의 로그인 계정이 이미 존재합니다.")
  }

  const password = await hashPassword(rawPassword)
  let row: Record<string, unknown> = {
    company,
    store,
    name,
    nick: name,
    password,
    role: "Manager",
    job: "manager",
  }

  let inserted: Array<{ id?: number }> = []
  for (;;) {
    try {
      const result = await supabaseInsert("employees", row)
      inserted = Array.isArray(result) ? (result as Array<{ id?: number }>) : []
      break
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/nick|42703|column/i.test(msg) && "nick" in row) {
        const { nick: _n, ...rest } = row
        row = rest
        continue
      }
      if (/tenant_id|42703|column/i.test(msg) && "tenant_id" in row) {
        const { tenant_id: _t, ...rest } = row
        row = rest
        continue
      }
      if (/(duplicate key|23505)/i.test(msg)) {
        throw new Error("이미 등록된 로그인 계정입니다.")
      }
      throw e
    }
  }

  let employeeId = Math.floor(Number(inserted?.[0]?.id || 0))
  if (employeeId <= 0) {
    const found = (await supabaseSelectFilter(
      "employees",
      `company=eq.${encodeURIComponent(company)}&store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`,
      { limit: 1, select: "id" }
    )) as { id?: number }[]
    employeeId = Math.floor(Number(found?.[0]?.id || 0))
  }
  if (employeeId <= 0) {
    throw new Error("로그인 계정을 생성했으나 employees.id를 확인하지 못했습니다.")
  }

  return { employeeId, company, store, name }
}
