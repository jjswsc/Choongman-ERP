/**
 * Add 40 POS i18n keys missing from strict build check (pos-orders audit/grab/linkpos tabs).
 * Run: node vercel-app/scripts/patch-pos-i18n-missing-40.cjs
 * Then: node vercel-app/scripts/fill-pos-i18n-from-en.cjs
 */
const fs = require("fs")
const path = require("path")

const i18nPath = path.join(__dirname, "..", "lib", "i18n.ts")
let src = fs.readFileSync(i18nPath, "utf8")

const KEYS = {
  ko: {
    posAuditApplyEmployeeCodeFilter: "직원코드로 필터",
    posAuditApplyEmployeeFilter: "직원명으로 필터",
    posAuditApplyOrderNoFilter: "주문번호로 필터",
    posAuditColAction: "동작",
    posAuditColChangeDiff: "변경 내용",
    posAuditColChangedAt: "변경 시각",
    posAuditColEmployee: "직원",
    posAuditCollapse: "접기",
    posAuditEmployeeFilter: "직원",
    posAuditEmployeeFilterPh: "직원명/사번",
    posAuditJumpButton: "이동",
    posAuditJumpToOrderRow: "해당 주문 행으로 이동",
    posAuditReasonLabel: "사유",
    posAuditTrailHint:
      "주문·결제 변경 이력을 조회합니다. 기간과 직원으로 좁힌 뒤 [조회]를 누르세요.",
    posAuditTrailKeyboardHint: "변경 diff 셀 클릭: 펼치기/접기",
    posCashPageSub: "매장 시재 입출금·매출액 출금을 관리합니다.",
    posFilterPeriod: "조회 기간",
    posGrabColLastMessage: "마지막 메시지",
    posGrabColLastRequestId: "마지막 request ID",
    posGrabColMerchantId: "Merchant ID",
    posGrabColPartnerMerchantId: "Partner merchant ID",
    posGrabColUpdatedAt: "갱신 시각",
    posGrabIntegrationStatus: "연동 상태",
    posGrabPartnerSearchPh: "partnerMerchantID 검색",
    posLinkposApprovedAmountLabel: "승인 금액",
    posLinkposBankIdLabel: "Bank ID",
    posLinkposRefNoLabel: "승인번호",
    posLinkposReference1Label: "Reference1",
    posLinkposRequestedAmountLabel: "요청 금액",
    posLinkposRespondedAtLabel: "응답 시각",
    posLinkposResponseCodeLabel: "응답 코드",
    posLinkposSearchPh: "R1, 주문번호, 승인번호, 추적번호, 응답코드 검색",
    posLinkposStatApproved: "승인",
    posLinkposStatFailedDeclined: "실패/거절",
    posLinkposStatQueried: "조회",
    posOrderChannelFilter: "채널",
    posOrderTabAuditTrail: "감사로그",
    posOrderTabGrabIntegration: "Grab 연동 상태",
    posOrderTabLinkposFailed: "LINKPOS 실패 관리",
    posOrderTypeHall: "홀",
  },
  en: {
    posAuditApplyEmployeeCodeFilter: "Filter by employee code",
    posAuditApplyEmployeeFilter: "Filter by employee name",
    posAuditApplyOrderNoFilter: "Filter by order no.",
    posAuditColAction: "Action",
    posAuditColChangeDiff: "Changes",
    posAuditColChangedAt: "Changed at",
    posAuditColEmployee: "Employee",
    posAuditCollapse: "Collapse",
    posAuditEmployeeFilter: "Employee",
    posAuditEmployeeFilterPh: "Name or employee code",
    posAuditJumpButton: "Go",
    posAuditJumpToOrderRow: "Jump to order row",
    posAuditReasonLabel: "Reason",
    posAuditTrailHint:
      "Review order and payment change history. Set period and employee, then click Search.",
    posAuditTrailKeyboardHint: "Click a change diff cell to expand or collapse",
    posCashPageSub: "Manage store petty cash, deposits, and sales withdrawals.",
    posFilterPeriod: "Period",
    posGrabColLastMessage: "Last message",
    posGrabColLastRequestId: "Last request ID",
    posGrabColMerchantId: "Merchant ID",
    posGrabColPartnerMerchantId: "Partner merchant ID",
    posGrabColUpdatedAt: "Updated at",
    posGrabIntegrationStatus: "Integration status",
    posGrabPartnerSearchPh: "Search partnerMerchantID",
    posLinkposApprovedAmountLabel: "Approved amount",
    posLinkposBankIdLabel: "Bank ID",
    posLinkposRefNoLabel: "Ref no.",
    posLinkposReference1Label: "Reference1",
    posLinkposRequestedAmountLabel: "Requested amount",
    posLinkposRespondedAtLabel: "Responded at",
    posLinkposResponseCodeLabel: "Response code",
    posLinkposSearchPh: "Search R1, order no., approval, trace, response code",
    posLinkposStatApproved: "Approved",
    posLinkposStatFailedDeclined: "Failed/declined",
    posLinkposStatQueried: "Queried",
    posOrderChannelFilter: "Channel",
    posOrderTabAuditTrail: "Audit trail",
    posOrderTabGrabIntegration: "Grab integration",
    posOrderTabLinkposFailed: "LINKPOS failures",
    posOrderTypeHall: "Hall",
  },
}

function esc(v) {
  return String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function insertKeys(lang, entries) {
  const startRe = new RegExp(`\\n  ${lang}: \\{`)
  const m = startRe.exec(src)
  if (!m) throw new Error(`${lang} block not found`)
  const start = m.index
  const langs = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]
  const idx = langs.indexOf(lang)
  let end = src.length
  for (let i = idx + 1; i < langs.length; i++) {
    const nextRe = new RegExp(`\\n  ${langs[i]}: \\{`)
    const nm = nextRe.exec(src.slice(start + 1))
    if (nm) {
      end = start + 1 + nm.index
      break
    }
  }
  const block = src.slice(start, end)
  const missing = Object.keys(entries).filter((k) => !new RegExp(`\\n    ${k}:`).test(block))
  if (!missing.length) {
    console.log(`${lang}: all keys present`)
    return
  }
  const closeToken = block.includes("\n  } as Record<string, string>,")
    ? "\n  } as Record<string, string>,"
    : "\n  },"
  const closeIdx = block.lastIndexOf(closeToken)
  if (closeIdx < 0) throw new Error(`${lang} close token not found`)
  const addLines = missing.map((k) => `    ${k}: '${esc(entries[k])}',`).join("\n")
  const updated = block.slice(0, closeIdx) + "\n" + addLines + block.slice(closeIdx)
  src = src.slice(0, start) + updated + src.slice(end)
  console.log(`${lang}: added ${missing.length} keys`)
}

insertKeys("ko", KEYS.ko)
insertKeys("en", KEYS.en)
fs.writeFileSync(i18nPath, src, "utf8")
