/**
 * Insert missing interior vendor-directory i18n keys into th, mm, la, kh, vi, ms.
 * Run: node vercel-app/scripts/patch-interior-i18n-regional.mjs
 */
import fs from "fs"
import { writeI18nFileSync } from "./lib/i18n-encoding-guard.mjs"

const path = "c:/CM_ERP/vercel-app/lib/i18n.ts"
let lines = fs.readFileSync(path, "utf8").split(/\r?\n/)

const INSERT_BEFORE = "interiorVendorTracks:"

const BLOCKS = {
  th: `    interiorVendorsHub: 'ผู้รับเหมาตกแต่ง',
    interiorVendorDirectory: 'รายชื่อผู้รับเหมา',
    interiorVendorDirectoryHint: 'ลงทะเบียนผู้รับเหมาที่นี่ หรือเพิ่มอัตโนมัติเมื่อบันทึกสัญญาในโปรเจกต์',
    interiorVendorDirectoryEmpty: 'ยังไม่มีผู้รับเหมาที่ลงทะเบียน',
    interiorVendorDirectoryShowInactive: 'แสดงที่ไม่ใช้งาน',
    interiorVendorDirectoryActive: 'ใช้งาน',
    interiorVendorContactName: 'ผู้ติดต่อ',
    interiorVendorSpecialty: 'ประเภทงาน',
    interiorVendorSpecialtyPh: 'เช่น งานไม้, ไฟฟ้า, แอร์',
    interiorVendorUseCount: 'ใช้งาน',
    interiorVendorLastUsed: 'ใช้ล่าสุด',
    helpSum_admin_interior_vendors:
      'จัดการรายชื่อผู้รับเหมาและสัญญารายโปรเจกต์ (ชำระเงิน ส่งมอบ งานเสร็จ) ในแท็บ — บันทึกสัญญาจะเพิ่มชื่อในรายชื่ออัตโนมัติ',
    helpHow_admin_interior_vendors:
      '① แท็บรายชื่อ: ลงทะเบียนและแก้ไขผู้รับเหมา\\n② แท็บสัญญา: เลือกโปรเจกต์ แล้วติดตามวันชำระและวันส่งมอบ\\n③ บันทึกสัญญาจะเพิ่มชื่อผู้รับเหมาให้ใช้ซ้ำได้',`,
  mm: `    interiorVendorsHub: 'Interior vendors',
    interiorVendorDirectory: 'Vendor list',
    interiorVendorDirectoryHint: 'Register vendors here, or they are added automatically when you save project vendor tracks.',
    interiorVendorDirectoryEmpty: 'No interior vendors registered yet.',
    interiorVendorDirectoryShowInactive: 'Show inactive',
    interiorVendorDirectoryActive: 'Active',
    interiorVendorContactName: 'Contact',
    interiorVendorSpecialty: 'Trade',
    interiorVendorSpecialtyPh: 'e.g. woodwork, electrical',
    interiorVendorUseCount: 'Uses',
    interiorVendorLastUsed: 'Last used',
    helpSum_admin_interior_vendors:
      'Manage the vendor directory and per-project contracts (payments, deliveries, completion) in tabs. Saving a contract adds the vendor to the directory.',
    helpHow_admin_interior_vendors:
      '① Vendor list tab: register and edit subcontractors.\\n② Vendors & contracts tab: select a project, then track payment and material dates.\\n③ Contract saves auto-add vendor names for reuse.',`,
  la: `    interiorVendorsHub: 'Interior vendors',
    interiorVendorDirectory: 'Vendor list',
    interiorVendorDirectoryHint: 'Register vendors here, or they are added automatically when you save project vendor tracks.',
    interiorVendorDirectoryEmpty: 'No interior vendors registered yet.',
    interiorVendorDirectoryShowInactive: 'Show inactive',
    interiorVendorDirectoryActive: 'Active',
    interiorVendorContactName: 'Contact',
    interiorVendorSpecialty: 'Trade',
    interiorVendorSpecialtyPh: 'e.g. woodwork, electrical',
    interiorVendorUseCount: 'Uses',
    interiorVendorLastUsed: 'Last used',
    helpSum_admin_interior_vendors:
      'Manage the vendor directory and per-project contracts (payments, deliveries, completion) in tabs. Saving a contract adds the vendor to the directory.',
    helpHow_admin_interior_vendors:
      '① Vendor list tab: register and edit subcontractors.\\n② Vendors & contracts tab: select a project, then track payment and material dates.\\n③ Contract saves auto-add vendor names for reuse.',`,
  kh: `    interiorVendorsHub: 'Interior vendors',
    interiorVendorDirectory: 'Vendor list',
    interiorVendorDirectoryHint: 'Register vendors here, or they are added automatically when you save project vendor tracks.',
    interiorVendorDirectoryEmpty: 'No interior vendors registered yet.',
    interiorVendorDirectoryShowInactive: 'Show inactive',
    interiorVendorDirectoryActive: 'Active',
    interiorVendorContactName: 'Contact',
    interiorVendorSpecialty: 'Trade',
    interiorVendorSpecialtyPh: 'e.g. woodwork, electrical',
    interiorVendorUseCount: 'Uses',
    interiorVendorLastUsed: 'Last used',
    helpSum_admin_interior_vendors:
      'Manage the vendor directory and per-project contracts (payments, deliveries, completion) in tabs. Saving a contract adds the vendor to the directory.',
    helpHow_admin_interior_vendors:
      '① Vendor list tab: register and edit subcontractors.\\n② Vendors & contracts tab: select a project, then track payment and material dates.\\n③ Contract saves auto-add vendor names for reuse.',`,
  vi: `    interiorVendorsHub: 'Nhà thầu nội thất',
    interiorVendorDirectory: 'Danh sách nhà thầu',
    interiorVendorDirectoryHint: 'Đăng ký nhà thầu tại đây, hoặc tự thêm khi lưu hợp đồng trong dự án.',
    interiorVendorDirectoryEmpty: 'Chưa có nhà thầu nào được đăng ký.',
    interiorVendorDirectoryShowInactive: 'Hiện không hoạt động',
    interiorVendorDirectoryActive: 'Đang dùng',
    interiorVendorContactName: 'Liên hệ',
    interiorVendorSpecialty: 'Hạng mục',
    interiorVendorSpecialtyPh: 'vd. mộc, điện, điều hòa',
    interiorVendorUseCount: 'Lần dùng',
    interiorVendorLastUsed: 'Dùng gần nhất',
    helpSum_admin_interior_vendors:
      'Quản lý danh sách nhà thầu và hợp đồng theo dự án (thanh toán, giao hàng, hoàn thành) theo tab. Lưu hợp đồng sẽ thêm nhà thầu vào danh sách.',
    helpHow_admin_interior_vendors:
      '① Tab danh sách: đăng ký và sửa nhà thầu.\\n② Tab hợp đồng: chọn dự án, theo dõi ngày thanh toán và giao vật tư.\\n③ Lưu hợp đồng tự thêm tên nhà thầu để tái sử dụng.',`,
  ms: `    interiorVendorsHub: 'Kontraktor interior',
    interiorVendorDirectory: 'Senarai kontraktor',
    interiorVendorDirectoryHint: 'Daftar kontraktor di sini, atau ditambah automatik apabila anda simpan kontrak projek.',
    interiorVendorDirectoryEmpty: 'Belum ada kontraktor interior didaftarkan.',
    interiorVendorDirectoryShowInactive: 'Tunjuk tidak aktif',
    interiorVendorDirectoryActive: 'Aktif',
    interiorVendorContactName: 'Hubungi',
    interiorVendorSpecialty: 'Bidang',
    interiorVendorSpecialtyPh: 'cth. kerja kayu, elektrik',
    interiorVendorUseCount: 'Kali guna',
    interiorVendorLastUsed: 'Guna terakhir',
    helpSum_admin_interior_vendors:
      'Urus direktori kontraktor dan kontrak setiap projek (bayaran, penghantaran, siap) dalam tab. Simpan kontrak menambah kontraktor ke senarai.',
    helpHow_admin_interior_vendors:
      '① Tab senarai: daftar dan edit subkontraktor.\\n② Tab kontrak: pilih projek, jejak tarikh bayaran dan bahan.\\n③ Simpan kontrak auto-tambah nama kontraktor untuk kegunaan semula.',`,
}

const langs = ["th", "mm", "la", "kh", "vi", "ms"]
const starts = {}
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^  (ko|en|th|mm|la|kh|vi|ms): \{/)
  if (m) starts[m[1]] = i
}

let patched = 0
for (const lang of langs) {
  const start = starts[lang]
  const end = starts[langs[langs.indexOf(lang) + 1] ?? ""] ?? lines.length
  let hasVendorHub = false
  for (let i = start + 1; i < end; i++) {
    if (lines[i].includes("interiorVendorsHub:")) {
      hasVendorHub = true
      break
    }
  }
  if (hasVendorHub) {
    console.log(`${lang}: already has vendor hub keys, skip`)
    continue
  }
  for (let i = start + 1; i < end; i++) {
    if (!lines[i].includes(INSERT_BEFORE)) continue
    lines.splice(i, 0, BLOCKS[lang])
    patched++
    console.log(`${lang}: inserted vendor keys before line ${i + 1}`)
    break
  }
}

if (patched > 0) {
  writeI18nFileSync(path, lines.join("\n"))
  console.log(`Patched ${patched} language block(s).`)
} else {
  console.log("No patches needed.")
}
