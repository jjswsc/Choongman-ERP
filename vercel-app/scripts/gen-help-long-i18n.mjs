import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(__dirname, "..", "lib", "i18n-admin-help-long.ts")

/** [ id suffix, 한글 제목, English title ] — `helpLongWhat_${id}` / `helpLongHow_${id}` */
const ROWS = [
  ["admin", "관리자 대시보드(홈)", "Admin home dashboard"],
  ["admin_office", "대시보드(본사·전사 뷰)", "Dashboard (HQ / office view)"],
  ["admin_franchise", "대시보드(가맹·단일/복수 매장 뷰)", "Dashboard (franchise and store view)"],
  ["admin_ai_center", "AI 센터", "AI center and assistants"],
  ["admin_notices", "공지", "Notices to staff and stores"],
  ["admin_company_documents", "회사 문서(하이브리드)", "Company documents and Drive links"],
  ["admin_work_log", "업무일지(전역)", "Work log (reference)"],
  ["admin_pos_cost_analysis", "POS 원가·이익 분석", "POS cost and margin analysis"],
  ["admin_members", "회원 목록", "Member directory"],
  ["admin_members_points", "회원 포인트", "Member point balances and history"],
  ["admin_members_coupons", "회원 쿠폰", "Member-issued or linked coupons"],
  ["admin_members_visits", "회원 방문·구매", "Visits, orders, and recency"],
  ["admin_members_tiers", "회원 등급(티어)", "Tier rules and benefits"],
  ["admin_sales_management", "매출 관리", "Sales management and rollups"],
  [
    "admin_marketing_campaigns",
    "마케팅 캠페인",
    "Marketing campaigns and runbooks",
  ],
  ["admin_marketing_collab_menus", "콜라보·제휴 메뉴", "Collab and partner menu programs"],
  ["admin_marketing_promos", "프로모션", "Time-bound promos and bundles"],
  ["admin_marketing_ads", "광고·성과", "Ad tracking and performance"],
  ["admin_marketing_influencers", "인플루언서", "Influencer roster and deliverables"],
  ["admin_marketing_materials", "자료·소재(파일)", "Files, briefs, and handouts"],
  ["admin_marketing_calendar", "캘린더·일정", "Launch and content calendar"],
  ["admin_marketing_report", "마케팅 리포트", "Marketing report exports"],
  ["admin_marketing_integrations", "외부 연동", "External API keys and syncs"],
  ["admin_store_check", "매장 점검", "Store checklists and findings"],
  ["admin_store_visit", "매장 방문", "Field visit logs"],
  ["admin_store_repairs", "매장·장비 A/S", "Repairs, vendors, and jobs"],
  ["admin_complaints", "컴플레인(클레임)", "Complaint intake and resolution"],
  ["pos", "POS(주문·결제·테이블)", "POS orders, pay, and tables if enabled"],
  ["admin_pos_orders", "POS 주문 목록", "Back-office POS order list and reprint"],
  ["admin_pos_settlement", "POS 정산·일마감", "EOD, cash, variance, and sign-off"],
  ["admin_pos_cash", "POS·시재(현금)", "POS cash, drawer, and over/short rules"],
  ["admin_pos_screen_config", "POS·테이블 화면", "Table map and display layout"],
  ["admin_pos_menus", "POS 메뉴·가격", "Menu, options, channels, and pricing"],
  ["admin_pos_printers", "POS·주방·영수 프린터", "Printers, routing, and test prints"],
  ["admin_pos_coupons", "POS 쿠폰·할인", "In-store promos and coupons for POS"],
  [
    "admin_pos_tax_invoice_recipients",
    "전자(세금)계산서·고객사",
    "E-invoice, buyer, and seller data",
  ],
  ["admin_employees", "직원(인사)", "HR roster, roles, and scoping"],
  ["admin_hr_policies", "HR 정책·핸드북", "Handbook, acknowledgments, and versions"],
  ["admin_hr_calendar", "HR/근무·휴가 캘린더", "Work pattern and leave calendar view"],
  ["admin_attendance", "출퇴·근태", "Time clock, exceptions, and exports"],
  ["admin_leave", "휴가(연차) 신청", "Leave types, balance, and approvals"],
  ["admin_items", "물류 품목(SKU)", "Item master, units, and costing link"],
  ["admin_vendors", "거래처(매입)", "Vendors, terms, and order linkage"],
  ["admin_orders", "발주(의뢰) 목록", "PO or PR list and line status"],
  ["admin_order_create", "발주(의뢰) 작성", "Create a new PO/PR and lines"],
  ["admin_stock", "재고", "On-hand, locations, lots, and min/max"],
  ["admin_inbound", "입고(전역)", "Receiving flow (inbound has its own guide in-app)"],
  ["admin_outbound", "출고·이동", "Outbound, transfers, and approvals"],
  [
    "admin_accounting_purchase_order",
    "회계(발주) PO·품의",
    "Accounting view of purchase orders and budgets",
  ],
  ["admin_payroll", "급여(전역)", "Payroll (screen has its own help tab when applicable)"],
  ["admin_receivable_payable", "미수·미지급", "A/R, A/P, and aging by counterparty"],
  ["admin_expense_management", "지출(경비) 관리", "Expenses, receipts, and approvals"],
  ["admin_petty_cash", "시재(소액) 잡비", "Petty cash book and vouchers"],
  ["admin_bank_transactions", "은행 입출금", "Bank file import, matching, and rec"],
  ["admin_depreciation", "감가·고정자산", "Depreciation, assets, and disposals"],
  [
    "admin_financial_statements",
    "재무제표(손익·대차)",
    "P&L, balance sheet, and drill-downs",
  ],
  ["admin_chart_of_accounts", "계정과목(회계)", "Chart of accounts, mapping, controls"],
  ["admin_tax_filing", "세무(신고) 보조", "Tax calendar, prep, and hand-off"],
  ["admin_interior", "인테리어(프로젝트) 허브", "Interior program hub and project list"],
  ["admin_interior_schedule", "인테리어 일정·공정", "Milestones and Gantt-style dates"],
  ["admin_interior_vendors", "인테리어(하·업체)", "Sub-vendors, contracts, and tracks"],
  ["admin_interior_specs", "스펙·자재", "Specs, finishes, and hand-off to procurement"],
  ["admin_interior_drawings", "도면·리비전", "Drawings, versions, and sign-off log"],
  ["admin_interior_kitchen", "인테리어(주방·M&E)", "Kitchen scope, equipment, M&E handover"],
  ["admin_interior_costs", "인테리어 비용", "Budget, committed, actual, and change order"],
  ["admin_settings", "전역/테넌트 설정", "Branding, roles, stores, notification defaults"],
]

function esc(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
}

function blockKo(lk) {
  return `「${lk}」과 관련된 업무 범위, 권한, 접점(매장·법인·회계 마감)이 조직마다 다릅니다. 본 화면에서 보이는 지점(매장) 범위, 필드, 탭은 팀(운영/회계)에서 정한 정책·역할(권한)에 따라 달라질 수 있으며, 외부(은행, POS, 클라우드)와의 연동 지연이나 동시 편집이 있을 수 있으니 저장 전에 조회(새로고침)로 최신인지 확인하십시오. 개인·급여·고객·세무 데이터는 목적(범위)에 맞게 사용하고, 엑셀·캡처 유출(승인되지 않은 공유 채널)에 유의하십시오.`
}

function blockEn(lk) {
  return `This screen is for “${lk}”. The exact store scope, tabs, and fields depend on your role, org, and process (head office vs franchise, accounting close, etc.). External systems (POS, bank, cloud) may have replication delay or concurrency rules; refresh before you rely on balances. Use PII, payroll, and tax data with least privilege, and be careful with exports and screenshots outside approved channels.`
}

function howKo() {
  return `① (상단·좌측) 지점(매장), 기간 등 필터로 조회 범위를 먼저 잡은 뒤, 목록·상세에서 행을 선택하십시오.\n② (입력) 필수(※), 형식(날짜·숫자·드롭다운)을 맞추고, 저장(제출/승인) 전에 합계·수량·담당자를 다시 확인하십시오.\n③ (연동) 반영이 늦는 경우 새로고침 후에도 이상이면, 운영·IT·회계 SOP(마감·권한)에 따라 중복(동시) 입력이 없는지 점검하십시오.\n④ (결과) 내보내기(엑셀/인쇄)는 권한이 있는 담당자만 쓰고, 파일은 팀(회계) 공유 정책(폴더/메일/메신저)에 맞게 보관·폐기하십시오.`
}

function howEn() {
  return `① Pick store, date, and filters first, then open a row in the list or a detail form.\n② Fill required fields with correct types (dates, numbers, selects), and re-check amounts and approvers before Save, Submit, or Approve.\n③ If data looks stale, refresh; if it persists, check concurrency and month-end rules with ops or accounting to avoid double booking.\n④ Export and print only with appropriate rights; follow your org’s data-handling and retention policy.`
}

function outObj(type) {
  const o = `export const I18N_HELP_LONG_${type}: Record<string, string> = {
`
  const parts = [o]
  for (const [id, lk, le] of ROWS) {
    const what = type === "KO" ? blockKo(lk) : blockEn(le)
    const how = type === "KO" ? howKo() : howEn()
    parts.push(`  helpLongWhat_${id}: '${esc(what)}',
  helpLongHow_${id}: '${esc(how)}',
`)
  }
  parts.push("}\n")
  return parts.join("")
}

const header = `/**
 * Admin 상세 도움말 — \`helpLongWhat_*\` / \`helpLongHow_*\` (ko/en).
 * \`i18n.ts\`의 ko/en 객체에 spread 합니다. 재생성: \`node vercel-app/scripts/gen-help-long-i18n.mjs\`
 */
`

fs.writeFileSync(
  out,
  header + outObj("KO") + outObj("EN") + "export const I18N_HELP_LONG = { ko: I18N_HELP_LONG_KO, en: I18N_HELP_LONG_EN } as const\n"
)

console.log("Wrote", out, "rows", ROWS.length)
