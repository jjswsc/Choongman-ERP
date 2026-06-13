const fs = require("fs")
const path = require("path")
const p = path.join(__dirname, "../lib/i18n.ts")
const lines = fs.readFileSync(p, "utf8").split(/\r?\n/)

function insertHelpAfterApproveLine(lineNo, sum, how) {
  const idx = lineNo - 1
  if (!lines[idx]?.includes("aiCenterApproveCommentPlaceholder")) {
    console.warn("line mismatch", lineNo, lines[idx])
    return false
  }
  if (lines[idx + 1]?.includes("helpSum_admin_ai_center")) {
    console.log("already at", lineNo)
    return false
  }
  const block = [
    lines[idx],
    "    helpSum_admin_ai_center:",
    `      '${sum.replace(/'/g, "\\'")}',`,
    "    helpHow_admin_ai_center:",
    `      '${how.replace(/'/g, "\\'")}',`,
  ]
  lines.splice(idx, 1, ...block)
  return true
}

// Re-scan line numbers after prior edits
function findApproveLine(afterMarker) {
  const i = lines.findIndex((l) => l.includes(afterMarker))
  if (i < 0) return -1
  for (let j = i; j >= Math.max(0, i - 200); j--) {
    if (lines[j].includes("aiCenterApproveCommentPlaceholder")) return j + 1
  }
  return -1
}

const khLine = findApproveLine("adminNotices: 'ស")
const msLine = findApproveLine("adminNotices: 'Notis'")

if (khLine > 0) {
  insertHelpAfterApproveLine(
    khLine,
    "Ask questions using ERP data, internal knowledge, and weather/holidays; run approved actions from one AI hub.",
    "① On Q&A, set store, Bangkok date range, and intent, then generate an AI answer.\\n② Continue to follow-up task or notice drafts.\\n③ Create approval requests on Action drafts.\\n④ Review AI drafts and link to Notices/Work log.\\n⑤ Reload from Recent conversations.\\n⑥ Use Open next step after approval."
  )
  console.log("kh at", khLine)
}

if (msLine > 0) {
  insertHelpAfterApproveLine(
    msLine,
    "Tanya soalan menggunakan data ERP, pengetahuan dalaman, dan cuaca/cuti; laksana selepas kelulusan di Pusat AI.",
    "① Q&A: pilih kedai, julat tarikh (Bangkok), intent.\\n② Sambung ke draf tugasan/notis.\\n③ Cipta permintaan kelulusan.\\n④ Semak draf AI.\\n⑤ Perbualan terkini.\\n⑥ Open next step selepas kelulusan."
  )
  console.log("ms at", msLine)
}

fs.writeFileSync(p, lines.join("\n"), "utf8")
