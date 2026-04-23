import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { supabaseSelectFilter, supabaseUpsert } from "@/lib/supabase-server"

/** 신규 DB 테이블 없이 `system_settings` JSON 한 행에 매장·도움말별 메모를 둔다. */
const BUNDLE_KEY = "admin_help_handover_bundle_v1"

const MAX_BODY = 20_000
const MAX_ENTRIES = 8000
/** 매장·메뉴당 보관할 과거 버전 수(현재 본문 제외) */
const MAX_HISTORY_PER_ENTRY = 80

type HandoverRevision = {
  body: string
  updated_at: string
  updated_by_employee_id: number | null
  updated_by_name: string | null
}

type HandoverEntry = {
  tenant_id: string
  store_code: string
  help_href: string
  body: string
  updated_at: string
  updated_by_employee_id: number | null
  updated_by_name: string | null
  /** 직전 내용부터 쌓인 기록(최신이 앞). 현재 `body`와는 별개 */
  history?: HandoverRevision[]
}

type HandoverBundle = { v: 1; entries: HandoverEntry[] }

function isRevision(x: unknown): x is HandoverRevision {
  if (!x || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  return typeof o.body === "string" && typeof o.updated_at === "string"
}

function normalizeHistory(raw: unknown, cap: number): HandoverRevision[] {
  if (!Array.isArray(raw)) return []
  const out: HandoverRevision[] = []
  for (const x of raw) {
    if (!isRevision(x)) continue
    out.push({
      body: String(x.body).slice(0, MAX_BODY),
      updated_at: String(x.updated_at),
      updated_by_employee_id:
        x.updated_by_employee_id != null && Number.isFinite(Number(x.updated_by_employee_id))
          ? Math.floor(Number(x.updated_by_employee_id))
          : null,
      updated_by_name: x.updated_by_name != null ? String(x.updated_by_name).slice(0, 200) : null,
    })
    if (out.length >= cap) break
  }
  return out
}

function isHandoverEntry(x: unknown): x is HandoverEntry {
  if (!x || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  return (
    typeof o.tenant_id === "string" &&
    typeof o.store_code === "string" &&
    typeof o.help_href === "string" &&
    typeof o.body === "string" &&
    typeof o.updated_at === "string"
  )
}

function parseBundle(raw: unknown): HandoverBundle {
  if (raw == null) return { v: 1, entries: [] }
  let o: unknown = raw
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw) as unknown
    } catch {
      return { v: 1, entries: [] }
    }
  }
  if (!o || typeof o !== "object") return { v: 1, entries: [] }
  const rec = o as Record<string, unknown>
  const entriesIn = Array.isArray(rec.entries) ? rec.entries : []
  const entries = entriesIn.filter(isHandoverEntry).map((e) => {
    const entryRec = e as Record<string, unknown>
    return {
      tenant_id: e.tenant_id,
      store_code: e.store_code,
      help_href: e.help_href,
      body: e.body,
      updated_at: e.updated_at,
      updated_by_employee_id:
        e.updated_by_employee_id != null && Number.isFinite(Number(e.updated_by_employee_id))
          ? Math.floor(Number(e.updated_by_employee_id))
          : null,
      updated_by_name: e.updated_by_name != null ? String(e.updated_by_name).slice(0, 200) : null,
      history: normalizeHistory(entryRec.history, MAX_HISTORY_PER_ENTRY),
    }
  })
  return { v: 1, entries }
}

/** 클라이언트 `matchErpNavHrefForHelp` 결과와 동일한 형태만 허용 (사이드바 href 패턴) */
function normalizeHelpHref(raw: string): string {
  const p = String(raw || "").split("?")[0] || "/admin"
  const trimmed = p.length > 1 && p.endsWith("/") ? p.slice(0, -1) || "/admin" : p
  return trimmed || "/admin"
}

function isServerSafeHelpHref(href: string): boolean {
  const n = normalizeHelpHref(href)
  if (n.length < 2 || n.length > 180 || n.includes("..")) return false
  if (n === "/pos") return true
  return /^\/admin\/[a-zA-Z0-9/_-]+$/.test(n)
}

function jsonHeaders(): Headers {
  const h = new Headers()
  h.set("Content-Type", "application/json")
  return h
}

async function loadBundle(): Promise<HandoverBundle> {
  const rows = (await supabaseSelectFilter(
    "system_settings",
    `key=eq.${encodeURIComponent(BUNDLE_KEY)}`,
    { limit: 1 }
  )) as { value_json?: unknown }[] | null
  const raw = rows?.[0]?.value_json
  return parseBundle(raw)
}

async function saveBundle(bundle: HandoverBundle): Promise<void> {
  if (bundle.entries.length > MAX_ENTRIES) {
    bundle.entries = bundle.entries.slice(-MAX_ENTRIES)
  }
  await supabaseUpsert(
    "system_settings",
    [
      {
        key: BUNDLE_KEY,
        value_json: bundle,
        updated_at: new Date().toISOString(),
      },
    ],
    "key"
  )
}

function findEntryIndex(
  bundle: HandoverBundle,
  tenantId: string,
  store: string,
  helpHref: string
): number {
  return bundle.entries.findIndex(
    (e) => e.tenant_id === tenantId && e.store_code === store && e.help_href === helpHref
  )
}

/** GET: 현재 JWT 매장·도움말 메뉴에 대한 인수인계 메모 조회 */
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await requireAuth(req, "any")
  if (errorResponse || !auth) return errorResponse!

  const raw = req.nextUrl.searchParams.get("helpHref") || ""
  const helpHref = normalizeHelpHref(raw)
  if (!helpHref || !isServerSafeHelpHref(helpHref)) {
    return NextResponse.json(
      { success: false, message: "adminHelpHandoverInvalidHref" },
      { status: 400, headers: jsonHeaders() }
    )
  }

  const store = String(auth.store || "").trim()
  if (!store) {
    return NextResponse.json(
      { success: false, message: "adminHelpHandoverNoStore" },
      { status: 400, headers: jsonHeaders() }
    )
  }

  const tenantId = String(auth.tenantId ?? "").trim()
  try {
    const bundle = await loadBundle()
    const idx = findEntryIndex(bundle, tenantId, store, helpHref)
    const row = idx >= 0 ? bundle.entries[idx] : null
    const history =
      row?.history?.map((h) => ({
        body: h.body,
        updatedAt: h.updated_at,
        updatedByName: h.updated_by_name,
      })) ?? []
    return NextResponse.json(
      {
        success: true,
        note: row
          ? {
              body: row.body,
              updatedAt: row.updated_at,
              updatedByName: row.updated_by_name,
            }
          : null,
        history,
      },
      { headers: jsonHeaders() }
    )
  } catch (e) {
    console.error("adminHelpHandover GET:", e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { status: 500, headers: jsonHeaders() }
    )
  }
}

/** POST: 인수인계 메모 저장(동일 매장·메뉴 행을 entries에서 교체·추가) */
export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await requireAuth(req, "any")
  if (errorResponse || !auth) return errorResponse!

  const store = String(auth.store || "").trim()
  if (!store) {
    return NextResponse.json(
      { success: false, message: "adminHelpHandoverNoStore" },
      { status: 400, headers: jsonHeaders() }
    )
  }

  let bodyJson: unknown
  try {
    bodyJson = await req.json()
  } catch {
    bodyJson = {}
  }
  const o = bodyJson && typeof bodyJson === "object" ? (bodyJson as Record<string, unknown>) : {}
  const helpHref = normalizeHelpHref(String(o.helpHref ?? ""))
  const text = String(o.body ?? "").slice(0, MAX_BODY)

  if (!helpHref || !isServerSafeHelpHref(helpHref)) {
    return NextResponse.json(
      { success: false, message: "adminHelpHandoverInvalidHref" },
      { status: 400, headers: jsonHeaders() }
    )
  }

  const tenantId = String(auth.tenantId ?? "").trim()
  const now = new Date().toISOString()
  const name = String(auth.name || "").trim().slice(0, 200) || null
  const eid = auth.employeeId != null && auth.employeeId > 0 ? auth.employeeId : null

  try {
    const bundle = await loadBundle()
    const idx = findEntryIndex(bundle, tenantId, store, helpHref)
    const prev = idx >= 0 ? bundle.entries[idx] : null

    let history: HandoverRevision[] = prev?.history ? [...prev.history] : []
    if (prev && prev.body !== text) {
      history.unshift({
        body: prev.body.slice(0, MAX_BODY),
        updated_at: prev.updated_at,
        updated_by_employee_id: prev.updated_by_employee_id,
        updated_by_name: prev.updated_by_name,
      })
      if (history.length > MAX_HISTORY_PER_ENTRY) {
        history = history.slice(0, MAX_HISTORY_PER_ENTRY)
      }
    }

    const nextEntry: HandoverEntry = {
      tenant_id: tenantId,
      store_code: store,
      help_href: helpHref,
      body: text,
      updated_at: now,
      updated_by_employee_id: eid,
      updated_by_name: name,
      history,
    }

    if (idx >= 0) bundle.entries[idx] = nextEntry
    else bundle.entries.push(nextEntry)
    await saveBundle(bundle)

    const historyOut = history.map((h) => ({
      body: h.body,
      updatedAt: h.updated_at,
      updatedByName: h.updated_by_name,
    }))

    return NextResponse.json(
      {
        success: true,
        note: {
          body: text,
          updatedAt: now,
          updatedByName: name,
        },
        history: historyOut,
      },
      { headers: jsonHeaders() }
    )
  } catch (e) {
    console.error("adminHelpHandover POST:", e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { status: 500, headers: jsonHeaders() }
    )
  }
}
