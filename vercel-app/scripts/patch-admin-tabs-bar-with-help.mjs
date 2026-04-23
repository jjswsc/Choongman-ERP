import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const FILES = [
  "app/admin/store-visit/page.tsx",
  "app/admin/stock/page.tsx",
  "app/admin/order-create/page.tsx",
  "app/admin/accounting/purchase-order/page.tsx",
  "app/admin/financial-statements/page.tsx",
  "components/attendance/attendance-manage-content.tsx",
  "components/erp/pos-menu-category-settings-dialog.tsx",
  "app/admin/marketing/report/page.tsx",
  "components/tabs/expense-management-tab.tsx",
  "app/admin/leave/page.tsx",
  "app/admin/pos-cost-analysis/page.tsx",
  "components/admin/admin-store-visit.tsx",
  "components/tabs/admin-tab.tsx",
  "app/admin/outbound/page.tsx",
  "app/admin/inbound/page.tsx",
  "components/admin/admin-store-repairs.tsx",
  "app/admin/payroll/page.tsx",
  "components/admin/admin-settings.tsx",
  "components/tabs/receivable-payable-tab.tsx",
  "components/tabs/usage-tab.tsx",
  "app/admin/pos-screen-config/page.tsx",
  "app/admin/items/page.tsx",
  "components/admin/admin-store-check.tsx",
  "app/admin/pos-printers/page.tsx",
  "components/admin/tax-filing/tax-filing-shell.tsx",
  "app/admin/pos-orders/page.tsx",
  "app/admin/employees/page.tsx",
  "components/erp/worklog-page.tsx",
  "components/admin/admin-accounting-compliance.tsx",
  "components/tabs/petty-cash-tab.tsx",
  "components/tabs/depreciation-tab.tsx",
  "components/tabs/bank-transactions-tab.tsx",
  "components/tabs/order-tab.tsx",
  "components/admin/admin-complaints.tsx",
  "components/interior/interior-expense-content.tsx",
  "app/admin/pos-menus/page.tsx",
  "components/pos/pos-settlement-form.tsx",
]

const OPEN_RE = /<div className=\{adminTabsBarCn\}>\s*<div className=\{adminTabsScrollCn\}>\s*<TabsList className=\{adminTabsListRowCn\}>/g
const CLOSE_RE = /<\/TabsList>\s*<\/div>\s*<\/div>/g

const IMPORT_LINE = `import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"`

/** pos-menus / pos-screen-config: 두 번째 블록은 중첩 탭 — 인라인 도움말 없이 유지 */
function skipSecondOpen(fileRel, index) {
  if (fileRel === "app/admin/pos-menus/page.tsx" && index >= 1) return true
  if (fileRel === "app/admin/pos-screen-config/page.tsx" && index >= 1) return true
  return false
}

function addImport(src) {
  if (src.includes("AdminTabsBarWithHelp")) return src
  const m = src.match(/^import[^\n]*from ["']react["']/m)
  if (m) {
    const idx = m.index + m[0].length
    return src.slice(0, idx) + "\n" + IMPORT_LINE + src.slice(idx)
  }
  const firstImport = src.indexOf("import ")
  if (firstImport === -1) return IMPORT_LINE + "\n" + src
  return src.slice(0, firstImport) + IMPORT_LINE + "\n" + src.slice(firstImport)
}

for (const rel of FILES) {
  const fp = path.join(root, rel)
  if (!fs.existsSync(fp)) {
    console.warn("skip missing", rel)
    continue
  }
  let src = fs.readFileSync(fp, "utf8")
  if (!OPEN_RE.test(src)) {
    OPEN_RE.lastIndex = 0
    console.log("no open pattern", rel)
    continue
  }
  OPEN_RE.lastIndex = 0

  let openIdx = 0
  src = src.replace(OPEN_RE, (fullMatch) => {
    const skip = skipSecondOpen(rel, openIdx)
    openIdx++
    if (skip) return fullMatch
    return `<AdminTabsBarWithHelp>\n              <TabsList className={adminTabsListRowCn}>`
  })

  /** 닫는 쪽: 열기를 AdminTabsBarWithHelp로 바꾼 블록만 닫기를 바꿔야 함 — 단순화: 전부 TabsList></div></div> 를 순서대로 치환하면 중첩이 깨질 수 있음 */
  /** 대신: 파일별로 열기 치환 수만큼 닫기 치환 — pos-menus는 첫 블록만 AdminTabsBarWithHelp 이므로 첫 CLOSE_RE만 바꿈 */

  const opensHelp = (src.match(/<AdminTabsBarWithHelp>/g) || []).length
  if (opensHelp === 0) {
    console.warn("no AdminTabsBarWithHelp after open pass", rel)
    continue
  }

  let closeLeft = opensHelp
  src = src.replace(CLOSE_RE, (full) => {
    if (closeLeft <= 0) return full
    closeLeft--
    return `</TabsList>\n          </AdminTabsBarWithHelp>`
  })

  if (closeLeft > 0) {
    console.error("close mismatch", rel, closeLeft)
    process.exitCode = 1
    continue
  }

  src = addImport(src)
  fs.writeFileSync(fp, src)
  console.log("patched", rel)
}
