/**
 * 공지/인사규정 등 "브로드캐스트 대상" 수신자 판정 — getMyNotices·notice-read-aggregation·getMyHrPolicies 공통
 */

export type BroadcastTargetRow = {
  target_store?: string | null
  target_role?: string | null
  target_permission_group?: string | null
  target_recipients?: string | null
}

export type EmployeeTargetContext = {
  store: string
  name: string
  job: string
  role: string
}

/**
 * getMyNotices · aggregateNoticeReadStats `parseRecipientKeys` 와 동일
 */
export function parseTargetRecipientKeys(
  raw: string | null | undefined
): { store: string; name: string }[] {
  if (!raw || typeof raw !== "string") return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: { store: string; name: string }[] = []
    for (const s of parsed) {
      if (typeof s !== "string") continue
      const [store, name] = s.split("|")
      const st = (store || "").trim()
      const n = (name || "").trim()
      if (st && n) out.push({ store: st, name: n })
    }
    return out
  } catch {
    return []
  }
}

/**
 * aggregateNoticeReadStats.employeeReceivesBroadcastNotice 와 동일
 */
export function employeeReceivesBroadcast(emp: EmployeeTargetContext, row: BroadcastTargetRow): boolean {
  const myStore = (emp.store || "").trim()
  const myName = (emp.name || "").trim()
  if (!myName) return false
  const myJob = (emp.job || "").trim()
  const myRole = (emp.role || "").trim().toLowerCase()
  const targetStores = String(row.target_store || "전체").trim()
  const targetJobs = String(row.target_role || "전체").trim()
  const targetPerms = String(row.target_permission_group || "").trim()
  const storeMatch = targetStores === "전체" || targetStores.indexOf(myStore) > -1
  const jobList = String(targetJobs || "전체")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const jobMatch =
    !targetJobs ||
    targetJobs.trim() === "전체" ||
    jobList.length === 0 ||
    Boolean(myJob && jobList.indexOf(myJob.toLowerCase()) >= 0)
  const permList = targetPerms
    ? targetPerms
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : []
  const permMatch = permList.length === 0 || Boolean(myRole && permList.includes(myRole))
  return storeMatch && jobMatch && permMatch
}

/**
 * getMyNotices 91~121 루프와 동일: target_recipients 가 있고 비어 있지 않으면 키만 허용; 없으면 브로드캐스트 규칙
 */
export function employeeIsTargetedForRow(
  store: string,
  name: string,
  myJob: string,
  myRole: string,
  row: BroadcastTargetRow
): boolean {
  const recipientsRaw = row.target_recipients
  if (recipientsRaw) {
    try {
      const recipients = JSON.parse(String(recipientsRaw)) as string[]
      if (Array.isArray(recipients) && recipients.length > 0) {
        const myKey = `${store}|${name}`
        return recipients.includes(myKey)
      }
    } catch {
      // 원본: catch 시 아래 else 없이 통과 — 항목 포함
      return true
    }
    // 배열이 비어 있으면 원본 루프는 broadcast else 로 안 감 — 통과
    return true
  }
  return employeeReceivesBroadcast({ store, name, job: myJob, role: myRole }, row)
}

export function findEmployeeContextFromRoster(
  employees: { store?: string; name?: string; job?: string; role?: string }[],
  store: string,
  name: string
): { myJob: string; myRole: string } {
  let myJob = ""
  let myRole = ""
  for (let i = 0; i < (employees || []).length; i++) {
    const s = String(employees[i].store || "").trim()
    const n = String(employees[i].name || "").trim()
    if (s === store && n === name) {
      myJob = String(employees[i].job || employees[i].role || "").trim()
      myRole = String(employees[i].role || "").trim().toLowerCase()
      break
    }
  }
  return { myJob, myRole }
}
