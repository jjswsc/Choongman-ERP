import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const i18nPath = path.join(root, "lib", "i18n.ts")
const sidebarPath = path.join(root, "components", "erp", "erp-sidebar.tsx")

/** 푸터 `t("logout")` 등 `titleKey:`에 없는 키 */
const SIDEBAR_EXTRA_KEYS = ["logout"]

/**
 * 헤더·관리 레이아웃·퀵액션 등 사이드바 밖 ERP 셸에서 쓰는 useT 키 (늘릴 때 여기에 추가)
 */
const ERP_SHELL_KEYS = [
  "erpWindowsDownload",
  "windowsInstallerCopyHint",
  "windowsInstallerCopyFail",
  "header_auto_translate",
  "aiCenterHeaderPrefill",
  "posBack",
  "goToMobile",
  "header_view_store",
  "search",
  "header_notifications",
  "adminFallbackUser",
  "adminMyAccount",
  "adminProfile",
  "adminChangePw",
  "offlineBannerPendingData",
  "adminQuickActions",
]

function collectSidebarTitleKeys(tsx) {
  const keys = new Set()
  const re = /titleKey:\s*"([a-zA-Z0-9_]+)"/g
  let m
  while ((m = re.exec(tsx)) !== null) {
    keys.add(m[1])
  }
  for (const k of SIDEBAR_EXTRA_KEYS) keys.add(k)
  for (const k of ERP_SHELL_KEYS) keys.add(k)
  return keys
}

const RE_LANG = /^\s{2}(ko|en|th|mm|la|kh|vi|ms):\s*\{/
const RE_KV4 = /^\s{4}([a-zA-Z0-9_]+):/

const sidebarTsx = fs.readFileSync(sidebarPath, "utf8")
const keys = collectSidebarTitleKeys(sidebarTsx)

const text = fs.readFileSync(i18nPath, "utf8")
const lines = text.split(/\r?\n/)
let current = null
const byLang = {}

for (const line of lines) {
  const m = line.match(RE_LANG)
  if (m) {
    current = m[1]
    byLang[current] = byLang[current] || new Set()
    continue
  }
  if (!current) continue
  const k = line.match(RE_KV4)
  if (k) byLang[current].add(k[1])
}

const enK = byLang.en || byLang.ko
for (const L of ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]) {
  const have = byLang[L] || new Set()
  const missing = [...keys].filter((k) => !have.has(k))
  if (missing.length === 0) continue
  if (L === "ko" || L === "en") {
    console.log(`LANG ${L} 완전 누락 (${missing.length}):`, missing.join(", "))
    continue
  }
  const rawIfUseT = missing.filter((k) => !enK.has(k))
  if (rawIfUseT.length) {
    console.log(
      `LANG ${L}: en에도 없어 useT가 키문자 그대로 표시 (${rawIfUseT.length}):`,
      rawIfUseT.join(", "),
    )
  } else {
    console.log(
      `LANG ${L}: 사전에 없음 — 영어로 폴백 (${missing.length}개, 번역未 반영):`,
      missing.join(", "),
    )
  }
}

console.log("\n--- useT: 최종 문자열이 키와 동일(번역/폴백 전무)한 항목 ---")
for (const L of Object.keys(byLang)) {
  const d = byLang[L]
  const showRaw = [...keys].filter((k) => {
    const a = d.has(k)
    if (a) return false
    if (enK.has(k)) return false
    return true
  })
  if (showRaw.length) console.log(L, showRaw)
}

if (!enK) console.error("ERROR: no en/ko")
const titleKeyCount = [...sidebarTsx.matchAll(/titleKey:\s*"([a-zA-Z0-9_]+)"/g)].map((x) => x[1]).length
const titleKeyUnique = new Set([...sidebarTsx.matchAll(/titleKey:\s*"([a-zA-Z0-9_]+)"/g)].map((x) => x[1])).size
console.log(
  "완료. 검사 키:",
  keys.size,
  "| erp-sidebar 고유 titleKey:",
  titleKeyUnique,
  "(라인 매칭",
  titleKeyCount + ")",
)
console.log("  + 고정:", [...SIDEBAR_EXTRA_KEYS, ...ERP_SHELL_KEYS].length, "키 (스크립트 상단 SIDEBAR_EXTRA_KEYS / ERP_SHELL_KEYS)")
console.log("소스:", path.relative(root, sidebarPath))
