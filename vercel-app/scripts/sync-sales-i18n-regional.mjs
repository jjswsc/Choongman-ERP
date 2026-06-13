/**
 * Insert missing sales-menu i18n keys (ko/en-only) into th, mm, la, kh, vi, ms.
 * Run: node vercel-app/scripts/sync-sales-i18n-regional.mjs
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

function parseKeyValue(start, end, key) {
  for (let i = start + 1; i < end; i++) {
    if (!lines[i].match(new RegExp(`^    ${key}:`))) continue
    let line = lines[i].replace(new RegExp(`^    ${key}: `), "").trim()
    if (line === "" || line === ":") {
      const cont = lines[i + 1]?.trim() ?? ""
      if (cont.startsWith("'") && cont.endsWith("',")) {
        return cont.slice(1, -2).replace(/\\n/g, "\n").replace(/\\'/g, "'")
      }
    }
    if (line.startsWith("'") && line.endsWith("',")) {
      return line.slice(1, -2)
    }
    if (line.startsWith("'")) {
      let out = line.slice(1)
      for (let j = i + 1; j < end; j++) {
        const t = lines[j].trim()
        if (t.endsWith("',")) {
          out += (out.endsWith("\\n") ? "" : "") + t.slice(0, -2)
          if (out.startsWith("'")) out = out.slice(1)
          return out
        }
        out += t
      }
    }
  }
  return null
}

function keysInRange(start, end) {
  const set = new Set()
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^    ([a-zA-Z][a-zA-Z0-9_]*):/)
    if (m) set.add(m[1])
  }
  return set
}

const enStart = starts.en
const enEnd = starts.th
const enKeys = keysInRange(enStart, enEnd)

const KEY_PREFIXES = [
  "adminOpsCenter",
  "adminLiveStoreSales",
  "adminDashboardCharts",
  "adminDashboardStore",
  "adminDashboardOffice",
  "adminDashboardBranch",
  "adminDashboardLink",
  "adminDashboardHome",
  "adminDashboardPending",
  "adminRealtime",
  "liveStoreSales",
  "salesOverview",
  "salesTopicHint",
  "salesManagementPage",
  "salesSubnav",
  "totalSalesLink",
  "totalSalesDrill",
  "helpSum_admin_sales_management",
  "helpHow_admin_sales_management",
  "helpSum_admin_total_sales",
  "helpHow_admin_total_sales",
  "helpSum_admin_live_store_sales",
  "helpHow_admin_live_store_sales",
  "helpSum_admin_ops_center",
  "helpHow_admin_ops_center",
]

const keysToSync = [...enKeys].filter((k) =>
  KEY_PREFIXES.some((p) => k === p || k.startsWith(p))
)

const thOverrides = {
  salesSubnavAria: "เมนูยอดขาย",
  salesTopicHintLabel: "รายงานนี้",
  salesOverviewIntro:
    "ดู KPI หลัก ช่องทาง สาขา การชำระเงิน และแนวโน้มรายวันในหน้าเดียว — รายละเอียดอยู่ที่ลิงก์ด้านล่าง",
  salesOverviewDelta: "เทียบ",
  salesOverviewTopChannel: "ช่องทางยอดนิยม",
  salesOverviewLinkTotalSales: "รายละเอียดเมนู (Total Sales)",
  salesOverviewLinkPeriod: "วิเคราะห์ตามช่วงเวลา",
  salesOverviewLinkChannel: "วิเคราะห์ช่องทาง",
  salesOverviewLinkLive: "ยอดขายแบบเรียลไทม์",
  salesOverviewDailyTrend: "แนวโน้มยอดขายรายวัน",
  liveStoreSalesTabRealtime: "เรียลไทม์·โต๊ะ",
  liveStoreSalesTabCharts: "กราฟวันนี้",
  liveStoreSalesTabOps: "ตัวชี้วัดปฏิบัติการ",
  liveStoreSalesAutoRefresh: "รีเฟรชอัตโนมัติ (60 วินาที)",
  liveStoreSalesLastUpdated: "อัปเดตล่าสุด",
  adminOpsCenterTitle: "ศูนย์ปฏิบัติการ",
  adminOpsCenterSub:
    "ดู KPI คำสั่งซื้อ การชำระเงิน การพิมพ์ และปิดวันตามสาขาและวันที่ (เวลากรุงเทพ) ด้านล่าง",
  adminOpsCenterHqSummaryTitle: "สาขาที่ต้องติดตาม (สำนักงานใหญ่)",
  adminOpsCenterHqSummarySub: "สาขาที่พิมพ์ล้มเหลว คิวรอ หรือยังไม่ปิดวัน",
  adminOpsCenterLinkPosPrinters: "ตั้งค่าเครื่องพิมพ์",
  adminOpsCenterLinkPosSettlement: "ปิดวัน POS",
  adminOpsCenterAlertPrintFailed: "พิมพ์ล้มเหลว — ตรวจเครื่องพิมพ์และการส่งครัว",
  adminOpsCenterAlertPrintBacklog: "คิวพิมพ์ค้าง — ตรวจยอดเรียลไทม์และซิงค์",
  adminOpsCenterAlertClosePending: "ยังไม่ปิดวัน — เปิดปิดวัน POS",
  salesManagementPageSub:
    "รายงานช่วงเวลา สาขา ช่องทาง เมนู ส่วนลด — บันทึกเงื่อนไข ส่งออก Excel และแชร์ URL",
  adminRealtimeTableTotalHint:
    "ยอดรวมออเดอร์โต๊ะที่กำลังดำเนินการ — รีเฟรชด้วย「ค้นหา」ในแผงเรียลไทม์ด้านล่าง",
  adminDashboardStoreTableFootnote:
    "หน้าร้าน/เดลิเวอรี่/ห่อกลับ/รวม คือยอดขายที่เสร็จแล้วในวันธุรกิจ POS โต๊ะคือออเดอร์ที่กำลังดำเนินการ — รีเฟรชด้วย「ค้นหา」",
  adminDashboardChartsSub:
    "วันธุรกิจ POS — ดูยอดขายตามสาขา หน้าร้าน/ห่อกลับ/เดลิเวอรี่ และแอปเดลิเวอรี่",
  adminDashboardChartsRefreshHint:
    "กด「ค้นหา」เพื่อรีเฟรช — ใช้จัดการยอดขายสำหรับวิเคราะห์ช่วงเวลา",
  adminRealtimeOfficeCompletedShare: "สัดส่วนยอดขายจริงตามสาขา",
  adminRealtimeOfficeCancelStockout: "อัตราหมดสต็อก·ยกเลิก (%)",
  adminRealtimeOfficeRevenueStack: "ยอดขายจริง·รอ·ล่าช้าต่อสาขา (ซ้อนแท่ง)",
  totalSalesLinkSalesMgmt: "จัดการยอดขาย",
  totalSalesDrillHint: "คลิกเพื่อไปยังระดับถัดไปและค้นหา",
  helpSum_admin_sales_management: "วิเคราะห์ยอดขายจากออเดอร์ POS ที่เสร็จแล้ว",
  helpHow_admin_sales_management:
    "ใช้ปุ่มหัวข้อและคำอธิบายบนหน้าจอ — รายละเอียดที่ Total Sales หรือยอดเรียลไทม์",
  helpSum_admin_total_sales: "ดูจำนวนและยอดขายเมนูตามระดับหมวดหมู่ถึงตัวเลือก",
  helpHow_admin_total_sales:
    "ใช้ตัวกรอง แท็บ และเปรียบเทียบช่องทางบนหน้าจอ แล้วกดค้นหา",
  helpSum_admin_live_store_sales: "ยอดขาย โต๊ะ และตัวชี้วัดปฏิบัติการวันนี้",
  helpHow_admin_live_store_sales:
    "ใช้แท็บ (เรียลไทม์ กราฟวันนี้ ปฏิบัติการ) เลือกสาขา และรีเฟรช",
  helpSum_admin_ops_center: "ติดตาม KPI คำสั่งซื้อ การชำระเงิน พิมพ์ และปิดวันในที่เดียว",
  helpHow_admin_ops_center: "เลือกสาขาและวันที่ ดูการแจ้งเตือนและลิงก์ที่เกี่ยวข้อง",
}

const viOverrides = {
  salesOverviewIntro:
    "Xem KPI, kênh, cửa hàng, thanh toán và xu hướng ngày trong một màn hình — chi tiết ở liên kết bên dưới.",
  salesOverviewDelta: "so với",
  salesOverviewTopChannel: "Kênh hàng đầu",
  salesOverviewLinkTotalSales: "Chi tiết menu (Total Sales)",
  salesOverviewLinkPeriod: "Phân tích theo kỳ",
  salesOverviewLinkChannel: "Phân tích kênh",
  salesOverviewLinkLive: "Doanh thu trực tiếp",
  salesOverviewDailyTrend: "Xu hướng doanh thu theo ngày",
  liveStoreSalesTabRealtime: "Trực tiếp & bàn",
  liveStoreSalesTabCharts: "Biểu đồ hôm nay",
  liveStoreSalesTabOps: "Chỉ số vận hành",
  liveStoreSalesAutoRefresh: "Tự làm mới (60 giây)",
  liveStoreSalesLastUpdated: "Cập nhật lần cuối",
  adminOpsCenterTitle: "Trung tâm vận hành",
  adminOpsCenterSub:
    "KPI đơn hàng, thanh toán, in và chốt ngày theo cửa hàng và ngày (Bangkok) bên dưới.",
  salesManagementPageSub:
    "Báo cáo kỳ, cửa hàng, kênh, menu, giảm giá — lưu bộ lọc, Excel và URL.",
  totalSalesLinkSalesMgmt: "Quản lý doanh thu",
  totalSalesDrillHint: "Nhấp để xem cấp con và tìm kiếm",
}

const msOverrides = {
  salesOverviewIntro:
    "Lihat KPI, saluran, kedai, bayaran dan trend harian dalam satu skrin — butiran melalui pautan di bawah.",
  salesOverviewDelta: "berbanding",
  salesOverviewTopChannel: "Saluran teratas",
  salesOverviewLinkTotalSales: "Butiran menu (Total Sales)",
  salesOverviewLinkPeriod: "Analisis tempoh",
  salesOverviewLinkChannel: "Analisis saluran",
  salesOverviewLinkLive: "Jualan langsung",
  salesOverviewDailyTrend: "Trend jualan harian",
  liveStoreSalesTabRealtime: "Langsung & meja",
  liveStoreSalesTabCharts: "Carta hari ini",
  liveStoreSalesTabOps: "Metrik operasi",
  liveStoreSalesAutoRefresh: "Muat semula auto (60s)",
  liveStoreSalesLastUpdated: "Kemas kini terakhir",
  adminOpsCenterTitle: "Pusat operasi",
  adminOpsCenterSub:
    "KPI pesanan, bayaran, cetak dan tutup hari mengikut kedai dan tarikh (Bangkok) di bawah.",
  salesManagementPageSub:
    "Laporan tempoh, kedai, saluran, menu, diskaun — simpan penapis, Excel dan URL.",
  totalSalesLinkSalesMgmt: "Pengurusan jualan",
  totalSalesDrillHint: "Klik untuk pergi ke peringkat anak dan carian",
}

const overridesByLang = { th: thOverrides, vi: viOverrides, ms: msOverrides }

function escapeLine(key, v) {
  if (!v.includes("\n")) {
    return `    ${key}: '${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}',`
  }
  const escaped = v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")
  return `    ${key}: '${escaped}',`
}

const anchorKey = "salesTopicOverviewReportHint"
const targets = ["th", "mm", "la", "kh", "vi", "ms"]

for (const lang of targets) {
  const start = starts[lang]
  const idx = langs.indexOf(lang)
  const end = idx + 1 < langs.length ? starts[langs[idx + 1]] : lines.length
  const have = keysInRange(start, end)
  const missing = keysToSync.filter((k) => !have.has(k))
  if (missing.length === 0) {
    console.log(`${lang}: nothing to add`)
    continue
  }

  let anchorLine = -1
  for (let i = start + 1; i < end; i++) {
    if (lines[i].match(new RegExp(`^    ${anchorKey}:`))) {
      anchorLine = i
      break
    }
  }
  if (anchorLine < 0) {
    console.error(`${lang}: anchor ${anchorKey} not found`)
    continue
  }

  const insertLines = []
  for (const key of missing.sort()) {
    const enVal = parseKeyValue(enStart, enEnd, key)
    if (!enVal) continue
    const val = overridesByLang[lang]?.[key] ?? enVal
    insertLines.push(escapeLine(key, val))
  }

  lines.splice(anchorLine + 1, 0, ...insertLines)
  // shift subsequent starts
  for (const l of langs) {
    if (starts[l] > anchorLine) starts[l] += insertLines.length
  }
  console.log(`${lang}: added ${insertLines.length} keys`)
}

fs.writeFileSync(path, lines.join("\n"))
console.log("done")
