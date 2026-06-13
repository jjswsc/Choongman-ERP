/**
 * Add 11 multiline-missed sales i18n keys + localize th ops/dashboard strings.
 * Run: node vercel-app/scripts/patch-sales-i18n-missing.mjs
 */
import fs from "fs"

const path = "c:/CM_ERP/vercel-app/lib/i18n.ts"
let lines = fs.readFileSync(path, "utf8").split(/\r?\n/)

const langs = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]
const starts = {}
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^  (ko|en|th|mm|la|kh|vi|ms): \{/)
  if (m) starts[m[1]] = i
}

function langCloseLine(lang) {
  const idx = langs.indexOf(lang)
  const next = idx + 1 < langs.length ? starts[langs[idx + 1]] : lines.length
  for (let i = next - 1; i > starts[lang]; i--) {
    if (lines[i] === "  },") return i
  }
  return next - 1
}

function langRange(lang) {
  return { start: starts[lang], end: langCloseLine(lang) }
}

function hasKey(lang, key) {
  const { start, end } = langRange(lang)
  const re = new RegExp(`^    ${key}:`)
  for (let i = start + 1; i < end; i++) {
    if (lines[i].match(re)) return true
  }
  return false
}

function parseKeyValue(start, end, key) {
  for (let i = start + 1; i < end; i++) {
    if (!lines[i].match(new RegExp(`^    ${key}:`))) continue
    let rest = lines[i].replace(new RegExp(`^    ${key}:\\s*`), "").trim()
    if (rest === "") {
      const parts = []
      for (let j = i + 1; j < end; j++) {
        const t = lines[j].trim()
        if (/^    [A-Za-z][A-Za-z0-9_]*:/.test(lines[j])) break
        parts.push(t)
        if (t.endsWith("',") || t.endsWith('",')) break
      }
      rest = parts.join(" ").trim()
    }
    if (rest.startsWith("'") && rest.endsWith("',")) {
      return rest.slice(1, -2).replace(/\\n/g, "\n").replace(/\\'/g, "'")
    }
    if (rest.startsWith("'")) {
      let out = rest.slice(1)
      for (let j = i + 1; j < end; j++) {
        const t = lines[j].trim()
        if (t.endsWith("',")) {
          out += t.slice(0, -2)
          return out.replace(/\\n/g, "\n").replace(/\\'/g, "'")
        }
        if (/^    [A-Za-z][A-Za-z0-9_]*:/.test(lines[j])) break
        out += t
      }
    }
  }
  return null
}

function formatEntry(key, value) {
  const esc = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")
  if (esc.length > 72 || value.includes("\n")) {
    return [`    ${key}:`, `      '${esc}',`]
  }
  return [`    ${key}: '${esc}',`]
}

function insertAfter(lang, afterKey, key, value) {
  const { start, end } = langRange(lang)
  let anchor = -1
  for (let i = start + 1; i < end; i++) {
    if (lines[i].match(new RegExp(`^    ${afterKey}:`))) {
      anchor = i
      if (!lines[i].trim().endsWith("',") && !lines[i].trim().endsWith('",')) {
        let j = i + 1
        while (j < end && !/^    [A-Za-z][A-Za-z0-9_]*:/.test(lines[j])) j++
        anchor = j - 1
      }
      break
    }
  }
  if (anchor < 0 || anchor >= end) {
    console.warn(`${lang}: anchor ${afterKey} not found for ${key}`)
    return false
  }
  const entry = formatEntry(key, value)
  lines.splice(anchor + 1, 0, ...entry)
  for (const l of langs) {
    if (starts[l] > anchor) starts[l] += entry.length
  }
  return true
}

function replaceKey(lang, key, value) {
  const { start, end } = langRange(lang)
  for (let i = start + 1; i < end; i++) {
    if (!lines[i].match(new RegExp(`^    ${key}:`))) continue
    let j = i
    if (!lines[i].trim().endsWith("',") && !lines[i].trim().endsWith('",')) {
      j = i + 1
      while (j < end && !/^    [A-Za-z][A-Za-z0-9_]*:/.test(lines[j])) j++
    }
    const entry = formatEntry(key, value)
    const removed = j - i + (lines[j]?.trim().endsWith("',") ? 1 : 0)
    let deleteCount = 1
    if (!lines[i].trim().endsWith("',")) {
      deleteCount = j - i + 1
    }
    lines.splice(i, deleteCount, ...entry)
    const delta = entry.length - deleteCount
    for (const l of langs) {
      if (starts[l] > i) starts[l] += delta
    }
    return true
  }
  return false
}

const MISSING = [
  ["salesManagementPageSub", "salesManagementTitle"],
  ["adminDashboardStoreTableFootnote", "adminRealtimeTableTotalHint"],
  ["salesOverviewIntro", "salesTopicHintLabel"],
  ["helpSum_admin_sales_management", "totalSalesLinkSalesMgmt"],
  ["helpHow_admin_sales_management", "helpSum_admin_sales_management"],
  ["helpSum_admin_total_sales", "helpHow_admin_sales_management"],
  ["helpHow_admin_total_sales", "helpSum_admin_total_sales"],
  ["helpSum_admin_live_store_sales", "helpHow_admin_total_sales"],
  ["helpHow_admin_live_store_sales", "helpSum_admin_live_store_sales"],
  ["helpSum_admin_ops_center", "helpHow_admin_live_store_sales"],
  ["helpHow_admin_ops_center", "helpSum_admin_ops_center"],
]

const th = {
  salesManagementPageSub:
    "รายงานช่วงเวลา สาขา ช่องทาง เมนู ส่วนลด — บันทึกเงื่อนไข ส่งออก Excel และแชร์ URL",
  adminDashboardStoreTableFootnote:
    "หน้าร้าน/เดลิเวอรี่/ห่อกลับ/รวม คือยอดขายที่เสร็จแล้วในวันธุรกิจ POS โต๊ะคือออเดอร์ที่กำลังดำเนินการ — รีเฟรชด้วย「ค้นหา」",
  salesOverviewIntro:
    "ดู KPI หลัก ช่องทาง สาขา การชำระเงิน และแนวโน้มรายวันในหน้าเดียว — รายละเอียดอยู่ที่ลิงก์ด้านล่าง",
  helpSum_admin_sales_management: "วิเคราะห์ยอดขายจากออเดอร์ POS ที่เสร็จแล้ว",
  helpHow_admin_sales_management:
    "ใช้ปุ่มหัวข้อและคำอธิบายบนหน้าจอ — รายละเอียดที่ Total Sales หรือยอดเรียลไทม์",
  helpSum_admin_total_sales: "ดูจำนวนและยอดขายเมนูตามระดับหมวดหมู่ถึงตัวเลือก",
  helpHow_admin_total_sales:
    "ใช้ตัวกรอง แท็บ และเปรียบเทียบช่องทางบนหน้าจอ แล้วกดค้นหา",
  helpSum_admin_live_store_sales: "ยอดขาย โต๊ะ และตัวชี้วัดปฏิบัติการวันนี้",
  helpHow_admin_live_store_sales:
    "ใช้แท็บ (เรียลไทม์ กราฟวันนี้ ปฏิบัติการ) เลือกสาขา และรีเฟรช",
  helpSum_admin_ops_center:
    "ติดตาม KPI คำสั่งซื้อ การชำระเงิน พิมพ์ และปิดวันในที่เดียว",
  helpHow_admin_ops_center:
    "เลือกสาขาและวันที่ ดูการแจ้งเตือนและลิงก์ที่เกี่ยวข้อง",
  adminOpsCenter: "ศูนย์ปฏิบัติการ",
  adminOpsCenterAlertsTitle: "การแจ้งเตือน",
  adminOpsCenterDateLabel: "วันที่อ้างอิง (กรุงเทพ)",
  adminOpsCenterKpiClosePending: "ยังไม่ปิดวัน (รายการ)",
  adminOpsCenterKpiOrderFailed: "ยกเลิก·คืนเงิน (รายการ)",
  adminOpsCenterKpiOrderSuccess: "คำสั่งซื้อสำเร็จ·กำลังดำเนินการ (รายการ)",
  adminOpsCenterKpiPaymentFailed: "การชำระเงินไม่อนุมัติ (รายการ)",
  adminOpsCenterKpiPrintFailed: "พิมพ์ล้มเหลว (รายการ)",
  adminOpsCenterKpiPrintQueued: "คิวพิมพ์ (รายการ)",
  adminOpsCenterLinkLiveSales: "ยอดขายเรียลไทม์ · แดชบอร์ดปฏิบัติการ",
  adminOpsCenterLinkSettlement: "ปิดวัน POS · ตรวจสอบ/ยืนยัน",
  adminOpsCenterLoadError: "โหลดตัวชี้วัดไม่สำเร็จ — ตรวจสอบการเข้าสู่ระบบ สิทธิ์ และเครือข่าย",
  adminOpsCenterNoAlerts: "ไม่มีการแจ้งเตือนในขณะนี้",
  adminOpsCenterQuickLinksTitle: "หน้าจอที่เกี่ยวข้อง",
  adminOpsCenterReload: "รีเฟรช",
  adminOpsCenterStoreLabel: "สาขา",
  adminOpsCenterStoreLoading: "กำลังโหลดรายชื่อสาขา…",
  adminDashboardBranchFocus: "รายละเอียดสาขา",
  adminDashboardChartsTitle: "กราฟยอดขายวันนี้",
  adminDashboardHomeSub: "หน้าแรกสำหรับลิงก์ด่วนและการแจ้งเตือน",
  adminDashboardLinkLiveSalesDesc: "ยอดขายวันนี้ โต๊ะ และออเดอร์ที่กำลังดำเนินการ",
  adminDashboardLinkMobileSalesDesc: "หน้ายอดขายและโต๊ะบนมือถือ",
  adminDashboardLinkOpsDesc: "KPI คำสั่งซื้อ การชำระเงิน พิมพ์ และปิดวัน",
  adminDashboardLinkSalesMgmtDesc: "วิเคราะห์ยอดขายตามช่วงเวลา ช่องทาง และสาขา",
  adminDashboardOfficeAllStores: "ทุกสาขา · ยอดขายและ KPI ปฏิบัติการวันนี้",
  adminDashboardPendingOrdersAlert: "คำสั่งซื้อที่ยังไม่อนุมัติ — ต้องดำเนินการ",
  adminLiveStoreSalesSubtitleAll: "ทุกสาขา · ยอดขายเรียลไทม์และโต๊ะวันนี้",
  adminLiveStoreSalesSubtitleBranch: "ยอดขายเรียลไทม์ของสาขา",
  adminLiveStoreSalesSubtitleFranchiseAll: "ทุกสาขาของฉัน · ยอดขายเรียลไทม์และโต๊ะ",
  adminRealtimeOpsOrderBars: "คำสั่งซื้อ·การปรุง (จำนวน)",
  adminRealtimeOpsRevenueBars: "ยอดขายเรียลไทม์ (แท่ง)",
  adminRealtimeOpsRevenuePie: "สัดส่วนยอดขาย (วงกลม)",
  adminRealtimeSalesByStorePaid: "ยอดขายจริงตามสาขา (แท่ง)",
  adminRealtimeSalesByStoreShare: "สัดส่วนยอดขายจริงตามสาขา",
  adminRealtimeSalesCashMix: "สัดส่วนยอดขายที่เสร็จแล้ว (เงินสด/อื่นๆ)",
  adminRealtimeSalesNonCash: "ไม่ใช่เงินสด",
  adminRealtimeSalesOrderCounts: "จำนวนคำสั่งซื้อ (เรียลไทม์)",
}

const vi = {
  salesManagementPageSub:
    "Báo cáo kỳ, cửa hàng, kênh, menu, giảm giá — lưu bộ lọc, Excel và URL.",
  adminDashboardStoreTableFootnote:
    "Tại chỗ/giao hàng/mang đi/tổng là doanh thu hoàn tất trong ngày kinh doanh POS. Bàn là đơn đang xử lý — làm mới bằng「Tìm kiếm」.",
  salesOverviewIntro:
    "Xem KPI, kênh, cửa hàng, thanh toán và xu hướng ngày trong một màn hình — chi tiết ở liên kết bên dưới.",
  helpSum_admin_sales_management: "Phân tích doanh thu từ đơn POS đã hoàn tất.",
  helpHow_admin_sales_management:
    "Dùng nút chủ đề và gợi ý trên màn hình — chi tiết tại Total Sales hoặc Doanh thu trực tiếp.",
  helpSum_admin_total_sales: "Xem số lượng và doanh thu menu theo cấp danh mục đến tùy chọn.",
  helpHow_admin_total_sales: "Dùng bộ lọc, tab và so sánh kênh, rồi nhấn Tìm kiếm.",
  helpSum_admin_live_store_sales: "Doanh thu, bàn và chỉ số vận hành hôm nay.",
  helpHow_admin_live_store_sales:
    "Dùng tab (trực tiếp, biểu đồ hôm nay, vận hành), chọn cửa hàng và làm mới.",
  helpSum_admin_ops_center:
    "Theo dõi KPI đơn hàng, thanh toán, in và chốt ngày tại một nơi.",
  helpHow_admin_ops_center: "Chọn chi nhánh và ngày, xem cảnh báo và liên kết liên quan.",
}

const ms = {
  salesManagementPageSub:
    "Laporan tempoh, kedai, saluran, menu, diskaun — simpan penapis, Excel dan URL.",
  adminDashboardStoreTableFootnote:
    "Makan di tempat/penghantaran/bungkus/jumlah ialah jualan siap dalam hari perniagaan POS. Meja ialah pesanan sedang diproses — muat semula dengan「Cari」.",
  salesOverviewIntro:
    "Lihat KPI, saluran, kedai, bayaran dan trend harian dalam satu skrin — butiran melalui pautan di bawah.",
  helpSum_admin_sales_management: "Analisis jualan daripada pesanan POS yang siap.",
  helpHow_admin_sales_management:
    "Guna butang topik dan petunjuk pada skrin — butiran di Total Sales atau Jualan langsung.",
  helpSum_admin_total_sales: "Lihat kuantiti dan jualan menu mengikut tahap kategori hingga pilihan.",
  helpHow_admin_total_sales: "Guna penapis, tab dan bandingan saluran, kemudian Cari.",
  helpSum_admin_live_store_sales: "Jualan, meja dan metrik operasi hari ini.",
  helpHow_admin_live_store_sales:
    "Guna tab (langsung, carta hari ini, operasi), pilih kedai dan muat semula.",
  helpSum_admin_ops_center: "Pantau KPI pesanan, bayaran, cetak dan tutup hari di satu tempat.",
  helpHow_admin_ops_center: "Pilih cawangan dan tarikh, lihat amaran dan pautan berkaitan.",
}

const overrides = { th, vi, ms }
const enStart = starts.en
const enEnd = starts.th

for (const lang of ["th", "mm", "la", "kh", "vi", "ms"]) {
  let added = 0
  for (const [key, afterKey] of MISSING) {
    if (hasKey(lang, key)) continue
    const enVal = parseKeyValue(enStart, enEnd, key)
    if (!enVal) {
      console.warn(`en missing ${key}`)
      continue
    }
    const val = overrides[lang]?.[key] ?? enVal
    if (insertAfter(lang, afterKey, key, val)) added++
  }
  console.log(`${lang}: inserted ${added} missing keys`)
}

for (const [key, val] of Object.entries(th)) {
  if (MISSING.some(([k]) => k === key)) continue
  if (hasKey("th", key)) replaceKey("th", key, val)
}

fs.writeFileSync(path, lines.join("\n"))
console.log("done")
