/**
 * HR hub i18n keys — all 8 languages. Run: node scripts/patch-hr-i18n.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { writeI18nFileSync } from "./lib/i18n-encoding-guard.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const filePath = path.join(__dirname, "../lib/i18n.ts")

let s = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n")

function patch(oldStr, newStr, label) {
  if (!s.includes(oldStr)) {
    console.error(`MISSING anchor [${label}]`)
    process.exitCode = 1
    return
  }
  s = s.replace(oldStr, newStr)
  console.log(`OK [${label}]`)
}

const UI_AFTER_EMP_SUB = {
  ko: `    adminEmployeesSub: '등록·입퇴사·적정인원·평가를 한 화면에서 관리합니다.',
    adminHrHome: '인사 홈',
    adminHrHomeSub: '대기 건수와 인사 일정 요약, 각 메뉴 바로가기',
    hrSubnavAria: '인사 관리 하위 메뉴',
    hr_hub_leave_pending: '휴가 승인 대기',
    hr_hub_att_pending: '근태 승인 대기',
    hr_hub_calendar_week: '이번 주 인사 일정',
    hr_hub_payroll: '급여 관리',
    hr_hub_payroll_sub: '계산·명세·공휴일',
    hr_hub_go_leave: '휴가 관리',
    hr_hub_go_att: '근태/스케줄',
    hr_hub_go_calendar: '인사 캘린더',
    hr_hub_go_payroll: '급여 바로가기',
    emp_quick_payroll: '급여',
    emp_quick_leave: '휴가',
    emp_quick_attendance: '근태',
    emp_csv_import: 'CSV 일괄 등록',
    emp_csv_import_title: '직원 CSV 일괄 등록',
    emp_csv_import_warn: '기존 직원 데이터를 모두 삭제한 뒤 CSV 내용으로 교체합니다. 반드시 백업 후 본사만 실행하세요.',
    emp_csv_import_pick: 'CSV 파일 선택',
    emp_csv_import_run: '업로드·적용',
    emp_csv_import_ok: '등록 완료',
    adminHrCalendarSub: '생일·입사·N년·퇴사 일정을 월별로 확인합니다.',
    adminHrPolicies:`,
  en: `    adminEmployeesSub: 'Register staff, track movement and headcount, and run evaluations in one place.',
    adminHrHome: 'HR home',
    adminHrHomeSub: 'Pending counts, this week\u2019s HR events, and shortcuts to each menu',
    hrSubnavAria: 'HR section navigation',
    hr_hub_leave_pending: 'Leave pending approval',
    hr_hub_att_pending: 'Attendance pending approval',
    hr_hub_calendar_week: 'HR events this week',
    hr_hub_payroll: 'Payroll',
    hr_hub_payroll_sub: 'Calc \u00b7 records \u00b7 holidays',
    hr_hub_go_leave: 'Leave',
    hr_hub_go_att: 'Attendance & schedule',
    hr_hub_go_calendar: 'HR calendar',
    hr_hub_go_payroll: 'Open payroll',
    emp_quick_payroll: 'Payroll',
    emp_quick_leave: 'Leave',
    emp_quick_attendance: 'Attendance',
    emp_csv_import: 'Import CSV',
    emp_csv_import_title: 'Bulk import employees from CSV',
    emp_csv_import_warn: 'This deletes ALL existing employee rows and replaces them with the CSV. Back up first \u2014 head office only.',
    emp_csv_import_pick: 'Choose CSV file',
    emp_csv_import_run: 'Upload & apply',
    emp_csv_import_ok: 'Import complete',
    adminHrCalendarSub: 'Birthdays, hire dates, anniversaries, and resignations by month.',
    adminHrPolicies:`,
  th: `    adminEmployeesSub: 'ลงทะเบียน ดูเข้า-ออก เป้าหมายจำนวนคน และประเมินในหน้าเดียว',
    adminHrHome: 'หน้าแรก HR',
    adminHrHomeSub: 'สรุปรายการรอและกิจกรรม HR สัปดาห์นี้ \u2014 ลิงก์ไปเมนูต่างๆ',
    hrSubnavAria: 'เมนูย่อย HR',
    hr_hub_leave_pending: 'การลารออนุมัติ',
    hr_hub_att_pending: 'การมาทำงานรออนุมัติ',
    hr_hub_calendar_week: 'กิจกรรม HR สัปดาห์นี้',
    hr_hub_payroll: 'เงินเดือน',
    hr_hub_payroll_sub: 'คำนวณ\u00b7สลิป\u00b7วันหยุด',
    hr_hub_go_leave: 'การลางาน',
    hr_hub_go_att: 'มาทำงาน/ตาราง',
    hr_hub_go_calendar: 'ปฏิทิน HR',
    hr_hub_go_payroll: 'เปิดเงินเดือน',
    emp_quick_payroll: 'เงินเดือน',
    emp_quick_leave: 'การลา',
    emp_quick_attendance: 'มาทำงาน',
    emp_csv_import: 'นำเข้า CSV',
    emp_csv_import_title: 'นำเข้าพนักงานจาก CSV',
    emp_csv_import_warn: 'ลบข้อมูลพนักงานเดิมทั้งหมดแล้วแทนที่ด้วย CSV สำรองข้อมูลก่อน \u2014 เฉพาะสำนักงานใหญ่',
    emp_csv_import_pick: 'เลือกไฟล์ CSV',
    emp_csv_import_run: 'อัปโหลด\u00b7ใช้',
    emp_csv_import_ok: 'นำเข้าเสร็จ',
    adminHrCalendarSub: 'วันเกิด\u00b7เริ่มงาน\u00b7ครบรอบ\u00b7ลาออก รายเดือน',
    adminHrPolicies:`,
  mm: `    adminEmployeesSub: 'မှတ်ပုံတင်၊ ဝင်/ထွက်၊ ပန်းတိုင်အင်အား၊ သုံးသပ်ချက်ကို တစ်နေရာတည်းတွင်။',
    adminHrHome: 'HR ပင်မစာမျက်နှာ',
    adminHrHomeSub: 'စောင့်ဆိုင်းမှုနှင့် ဒီအပတ် HR အစီအစဉ် အကျဉ်းချုပ်',
    hrSubnavAria: 'HR ခွဲမီနူး',
    hr_hub_leave_pending: 'ခွင့်အတည်ပြုရန် စောင့်ဆိုင်း',
    hr_hub_att_pending: 'Attendance အတည်ပြုရန် စောင့်ဆိုင်း',
    hr_hub_calendar_week: 'ဒီအပတ် HR အစီအစဉ်',
    hr_hub_payroll: 'လစာ',
    hr_hub_payroll_sub: 'တွက်ချက်\u00b7မှတ်တမ်း\u00b7ရုံးပိတ်ရက်',
    hr_hub_go_leave: 'ခွင့်',
    hr_hub_go_att: 'Attendance/Schedule',
    hr_hub_go_calendar: 'HR ပြက္ခဒိန်',
    hr_hub_go_payroll: 'လစာဖွင့်မည်',
    emp_quick_payroll: 'လစာ',
    emp_quick_leave: 'ခွင့်',
    emp_quick_attendance: 'Attendance',
    emp_csv_import: 'CSV တင်သွင်း',
    emp_csv_import_title: 'CSV ဖြင့် ဝန်ထမ်းတင်သွင်း',
    emp_csv_import_warn: 'ဝန်ထမ်းအားလုံးဖျက်ပြီး CSV နဲ့ အစားထိုးမည်။ backup ယူပြီး home office သာ။',
    emp_csv_import_pick: 'CSV ဖိုင်ရွေးပါ',
    emp_csv_import_run: 'တင်သွင်း\u00b7သုံးမည်',
    emp_csv_import_ok: 'တင်သွင်းပြီး',
    adminHrCalendarSub: 'မွေးနေ့·ဝင်ရက်·နှစ်ပြည့်·ထွက်ရက် လစဉ်',
    adminHrPolicies:`,
  la: `    adminEmployeesSub: 'ລົງທະບຽນ ເຂົ້າ-ອອກ ເປົ້າໝາຍຄົນ ແລະ ປະເມີນໃນໜ້າດຽວ.',
    adminHrHome: 'ໜ້າຫຼັກ HR',
    adminHrHomeSub: 'ສະຫຼຸບລໍຖ້າ ແລະ ຕາຕະລາງ HR ອາທິດນີ້',
    hrSubnavAria: 'ເມນູຍ່ອຍ HR',
    hr_hub_leave_pending: 'ການລາລໍຖ້າອະນຸມັດ',
    hr_hub_att_pending: 'ການມາວຽກລໍຖ້າອະນຸມັດ',
    hr_hub_calendar_week: 'ຕາຕະລາງ HR ອາທິດນີ້',
    hr_hub_payroll: 'ເງິນເດືອນ',
    hr_hub_payroll_sub: 'ຄິດໄລ່\u00b7ບັນທຶກ\u00b7ວັນພັກ',
    hr_hub_go_leave: 'ການລາພັກ',
    hr_hub_go_att: 'ມາວຽກ/ຕາຕະລາງ',
    hr_hub_go_calendar: 'ປະຕິທິນ HR',
    hr_hub_go_payroll: 'ເປີດເງິນເດືອນ',
    emp_quick_payroll: 'ເງິນເດືອນ',
    emp_quick_leave: 'ການລາ',
    emp_quick_attendance: 'ມາວຽກ',
    emp_csv_import: 'ນຳເຂົ້າ CSV',
    emp_csv_import_title: 'ນຳເຂົ້າພະນັກງານຈາກ CSV',
    emp_csv_import_warn: 'ລຶບພະນັກງານເກົ່າທັງໝົດ ແລ້ວແທນດ້ວຍ CSV \u2014 ສຳຮອງກ່ອນ, ສຳນັກງານໃຫຍ່ເທົ່ານັ້ນ',
    emp_csv_import_pick: 'ເລືອກໄຟລ໌ CSV',
    emp_csv_import_run: 'ອັບໂຫຼດ\u00b7ໃຊ້',
    emp_csv_import_ok: 'ນຳເຂົ້າແລ້ວ',
    adminHrCalendarSub: 'ວັນເກີດ·ເຂົ້າວຽກ·ຄົບຮອບ·ອອກ ລາຍເດືອນ',
    adminHrPolicies:`,
}

const UI_AFTER_EMP_KH = `    adminEmployees: 'បុគ្គលិក',
    adminHrHome: 'ទំព័រដើម HR',
    adminHrHomeSub: 'សង្ខេបការរង់ចាំ និងព្រឹត្តិការណ៍ HR សប្តាហ៍នេះ',
    hrSubnavAria: 'ការណែនាំ HR',
    hr_hub_leave_pending: 'ច្បាប់រង់ចាំអនុម័ត',
    hr_hub_att_pending: 'Attendance រង់ចាំអនុម័ត',
    hr_hub_calendar_week: 'ព្រឹត្តិការណ៍ HR សប្តាហ៍នេះ',
    hr_hub_payroll: 'ប្រាក់ខែ',
    hr_hub_payroll_sub: 'គណនា\u00b7កំណត់ត្រា\u00b7ថ្ងៃឈប់',
    hr_hub_go_leave: 'ច្បាប់',
    hr_hub_go_att: 'Attendance/កាលវិភាគ',
    hr_hub_go_calendar: 'ប្រតិទិន HR',
    hr_hub_go_payroll: 'បើកប្រាក់ខែ',
    emp_quick_payroll: 'ប្រាក់ខែ',
    emp_quick_leave: 'ច្បាប់',
    emp_quick_attendance: 'Attendance',
    emp_csv_import: 'នាំចូល CSV',
    emp_csv_import_title: 'នាំចូលបុគ្គលិកពី CSV',
    emp_csv_import_warn: 'លុបបុគ្គលិកទាំងអស់ រួចជំនួសដោយ CSV — បម្រុ រក្សាទុកមុន, ការិយាល័យកណ្ដាលតែប៉ុណ្ណោះ',
    emp_csv_import_pick: 'ជ្រើស CSV',
    emp_csv_import_run: 'ផ្ទុក·អនុវត្ត',
    emp_csv_import_ok: 'នាំចូលរួច',
    adminHrCalendarSub: 'ថ្ងៃកំណើត·ចូលធ្វើ·គ្រារពច·លាឈប់',
    adminEmployeesSub: 'ចុះបញ្ជី ផ្លាស់ប្តូរ និងវាយតម្លៃបុគ្គលិកក្នុងទំព័រតែមួយ។',
    adminAttendance:`

const UI_AFTER_EMP_VI = `    adminEmployees: 'Nhân viên',
    adminHrHome: 'Trang HR',
    adminHrHomeSub: 'Tóm tắt chờ duyệt và sự kiện HR tuần này',
    hrSubnavAria: 'Điều hướng HR',
    hr_hub_leave_pending: 'Nghỉ phép chờ duyệt',
    hr_hub_att_pending: 'Chấm công chờ duyệt',
    hr_hub_calendar_week: 'Sự kiện HR tuần này',
    hr_hub_payroll: 'Lương',
    hr_hub_payroll_sub: 'Tính\u00b7phiếu\u00b7ngày lễ',
    hr_hub_go_leave: 'Nghỉ phép',
    hr_hub_go_att: 'Chấm công/Lịch',
    hr_hub_go_calendar: 'Lịch HR',
    hr_hub_go_payroll: 'Mở lương',
    emp_quick_payroll: 'Lương',
    emp_quick_leave: 'Nghỉ phép',
    emp_quick_attendance: 'Chấm công',
    emp_csv_import: 'Nhập CSV',
    emp_csv_import_title: 'Nhập nhân viên từ CSV',
    emp_csv_import_warn: 'Xóa toàn bộ nhân viên cũ và thay bằng CSV. Sao lưu trước \u2014 chỉ văn phòng.',
    emp_csv_import_pick: 'Chọn file CSV',
    emp_csv_import_run: 'Tải lên\u00b7Áp dụng',
    emp_csv_import_ok: 'Nhập xong',
    adminHrCalendarSub: 'Sinh nhật·vào làm·kỷ niệm·nghỉ theo tháng',
    adminEmployeesSub: 'Đăng ký, biến động, định biên và đánh giá trên một trang.',
    adminAttendance:`

const UI_AFTER_EMP_MS = `    adminEmployees: 'Pekerja',
    adminHrHome: 'Laman HR',
    adminHrHomeSub: 'Ringkasan menunggu dan acara HR minggu ini',
    hrSubnavAria: 'Navigasi HR',
    hr_hub_leave_pending: 'Cuti menunggu kelulusan',
    hr_hub_att_pending: 'Kehadiran menunggu kelulusan',
    hr_hub_calendar_week: 'Acara HR minggu ini',
    hr_hub_payroll: 'Gaji',
    hr_hub_payroll_sub: 'Kira\u00b7rekod\u00b7cuti',
    hr_hub_go_leave: 'Cuti',
    hr_hub_go_att: 'Kehadiran/Jadual',
    hr_hub_go_calendar: 'Kalendar HR',
    hr_hub_go_payroll: 'Buka gaji',
    emp_quick_payroll: 'Gaji',
    emp_quick_leave: 'Cuti',
    emp_quick_attendance: 'Kehadiran',
    emp_csv_import: 'Import CSV',
    emp_csv_import_title: 'Import pekerja dari CSV',
    emp_csv_import_warn: 'Padam semua pekerja sedia ada dan ganti dengan CSV. Sandarkan dulu \u2014 pejabat pusat sahaja.',
    emp_csv_import_pick: 'Pilih fail CSV',
    emp_csv_import_run: 'Muat naik\u00b7Guna',
    emp_csv_import_ok: 'Import selesai',
    adminHrCalendarSub: 'Hari lahir·mula kerja·ulang tahun·berhenti',
    adminEmployeesSub: 'Daftar, pergerakan, headcount dan penilaian dalam satu halaman.',
    adminAttendance:`

const HELP_KO = `    helpHow_admin_hr_policies:
      '① 제목·첨부(또는 본문)·수신 대상(전체/오피스/매장/개인)을 입력한 뒤 저장합니다.\\n② 규정 목록에서 대상 구분 필터·「등록 내용 보기」·열람 상세를 확인합니다.\\n③ 게시·공지가 필요하면「대상·배포(공지)」로 활성화하고 안내를 보냅니다.',
    helpSum_admin_hr:
      '인사 관리 허브 — 휴가·근태 승인 대기, 이번 주 인사 일정, 급여·직원·규정 메뉴로 바로 이동합니다.',
    helpHow_admin_hr:
      '① 상단 KPI 카드에서 대기 건수·이번 주 일정을 확인합니다.\\n② 각 카드의 바로가기로 휴가·근태·캘린더·급여 화면으로 이동합니다.\\n③ 상단 서브내비로 직원·규정·캘린더·근태·휴가·급여를 오갑니다.',
    helpSum_admin_attendance:
      '출퇴근 기록 조회·승인, 지각·조퇴·연장 조정, 당일 실시간 근무, 주간 스케줄 조회·작성을 한 화면에서 처리합니다.',
    helpHow_admin_attendance:
      '① [근태 기록/승인]: 기간·매장·직원·상태로 조회 후 승인·조정합니다.\\n② [당일 실시간]: 오늘 출근 현황을 봅니다.\\n③ [스케줄 조회]·[스케줄 작성]: 주간 근무표를 확인·편집합니다.\\n④ [도움말] 탭에서 승인·조정·연장 규칙을 확인합니다.',
    helpSum_admin_leave:
      '휴가 신청 승인·반려와 기간별 연차·병가 등 사용·잔여 통계를 관리합니다.',
    helpHow_admin_leave:
      '① [승인]: 대기 목록에서 증명서 확인 후 승인·반려합니다.\\n② [통계]: 기간·매장별 사용·잔여 연차를 조회합니다.\\n③ 급여 관리에서 월별로 링크해 들어올 수 있습니다.',
    helpSum_admin_hr_calendar:
      '재직 직원의 생일·입사·N년·퇴사일을 월별 캘린더와 목록으로 확인합니다.',
    helpHow_admin_hr_calendar:
      '① 월·매장·유형 필터로 일정을 좁힙니다.\\n② 캘린더·목록에서 행을 클릭하면 직원 관리로 이동합니다.\\n③ 생일·입사기념 등을 매장 운영 일정과 함께 활용합니다.',
    helpSum_admin_payroll:
      '급여 계산·DB 저장, 명세서 조회·공지, 급여 변경 이력, 공휴일·규칙, 도움말을 한 화면에서 다룹니다.',
    helpHow_admin_payroll:
      '① [급여 계산]: 귀속월 선택 → 계산 실행 → 확인 후 DB 저장.\\n② [명세서]: 저장된 급여 조회·직원 공지·엑셀 내보내기.\\n③ [도움말] 탭에서 지각·조퇴·OT·공휴일 반영 규칙을 확인합니다.',
    adminHrCalendar:`

// patch UI blocks
for (const [lang, anchorEnd] of [
  ["ko", "    adminEmployeesSub: '등록·입퇴사·적정인원·평가를 한 화면에서 관리합니다.',\n    adminHrPolicies:"],
  ["en", "    adminEmployeesSub: 'Register staff, track movement and headcount, and run evaluations in one place.',\n    adminHrPolicies:"],
  ["th", "    adminEmployeesSub: 'ลงทะเบียน ดูเข้า-ออก เป้าหมายจำนวนคน และประเมินในหน้าเดียว',\n    adminHrPolicies:"],
  ["mm", "    adminEmployeesSub: 'မှတ်ပုံတင်၊ ဝင်/ထွက်၊ ပန်းတိုင်အင်အား၊ သုံးသပ်ချက်ကို တစ်နေရာတည်းတွင်။',\n    adminHrPolicies:"],
  ["la", "    adminEmployeesSub: 'ລົງທະບຽນ ເຂົ້າ-ອອກ ເປົ້າໝາຍຄົນ ແລະ ປະເມີນໃນໜ້າດຽວ.',\n    adminHrPolicies:"],
]) {
  patch(anchorEnd, UI_AFTER_EMP_SUB[lang], `${lang}-ui`)
}

patch(
  "    adminEmployees: 'បុគ្គលិក',\n    adminAttendance:",
  UI_AFTER_EMP_KH,
  "kh-ui"
)
patch(
  "    adminEmployees: 'Nhân viên',\n    adminAttendance:",
  UI_AFTER_EMP_VI,
  "vi-ui"
)
patch(
  "    adminEmployees: 'Pekerja',\n    adminAttendance:",
  UI_AFTER_EMP_MS,
  "ms-ui"
)

// help ko/en
patch(
  `    helpHow_admin_hr_policies:
      '① 제목·첨부(또는 본문)·수신 대상(전체/오피스/매장/개인)을 입력한 뒤 저장합니다.\\n② 규정 목록에서 대상 구분 필터·「등록 내용 보기」·열람 상세를 확인합니다.\\n③ 게시·공지가 필요하면「대상·배포(공지)」로 활성화하고 안내를 보냅니다.',
    adminHrCalendar:`,
  HELP_KO,
  "ko-help"
)

console.log("\n--- attendance/payroll/leave ---")

patch(
  "    adminAttendance: '근태/스케줄 관리',\n    adminPayroll: '급여 관리',\n    adminPayrollDirectorOnly: '급여 조회는 Director만 가능합니다.',",
  "    adminAttendance: '근태/스케줄 관리',\n    adminAttendanceSub: '근태 승인·조정과 주간 스케줄 조회·작성을 처리합니다.',\n    adminPayroll: '급여 관리',\n    adminPayrollSub: '급여 계산·명세·공휴일·규칙을 관리합니다.',\n    adminPayrollDirectorOnly: '급여 조회는 Director만 가능합니다.',\n    adminPayrollAccessDenied: '급여 관리는 본사·매장 관리자·가맹점주 권한이 필요합니다.',",
  "ko-att-pay"
)
patch(
  "    adminLeave: '휴가 관리',\n    adminAccountingPurchaseOrder:",
  "    adminLeave: '휴가 관리',\n    adminLeaveSub: '휴가 승인·반려와 사용·잔여 통계를 관리합니다.',\n    adminAccountingPurchaseOrder:",
  "ko-leave"
)

patch(
  "    adminAttendance: 'Attendance',\n    adminPayroll: 'Payroll',\n    adminPayrollDirectorOnly: 'Only Directors can view payroll.',",
  "    adminAttendance: 'Attendance',\n    adminAttendanceSub: 'Approve attendance, adjust late/early/OT, and manage weekly schedules.',\n    adminPayroll: 'Payroll',\n    adminPayrollSub: 'Calculate payroll, statements, holidays, and rules.',\n    adminPayrollDirectorOnly: 'Only Directors can view payroll.',\n    adminPayrollAccessDenied: 'Payroll requires head office, store manager, or franchisee access.',",
  "en-att-pay"
)
patch(
  "    adminLeave: 'Leave',\n    adminAccountingPurchaseOrder:",
  "    adminLeave: 'Leave',\n    adminLeaveSub: 'Approve or reject leave and review usage and balance statistics.',\n    adminAccountingPurchaseOrder:",
  "en-leave"
)

patch(
  "    adminAttendance: 'การมาทำงาน',\n    adminPayroll: 'เงินเดือน',\n    adminPayrollDirectorOnly: 'เฉพาะ Director เท่านั้นที่สามารถดูข้อมูลเงินเดือนได้',",
  "    adminAttendance: 'การมาทำงาน',\n    adminAttendanceSub: 'อนุมัติมาทำงาน ปรับสาย/กลับก่อน/OT และจัดการตารางรายสัปดาห์',\n    adminPayroll: 'เงินเดือน',\n    adminPayrollSub: 'คำนวณเงินเดือน สลิป วันหยุด และกฎ',\n    adminPayrollDirectorOnly: 'เฉพาะ Director เท่านั้นที่สามารถดูข้อมูลเงินเดือนได้',\n    adminPayrollAccessDenied: 'ต้องมีสิทธิสำนักงานใหญ่ ผู้จัดการร้าน หรือแฟรนไชส์',",
  "th-att-pay"
)
patch(
  "    adminLeave: 'การลางาน',\n    adminAccountingPurchaseOrder:",
  "    adminLeave: 'การลางาน',\n    adminLeaveSub: 'อนุมัติ/ปฏิเสธการลา และสถิติการใช้/คงเหลือ',\n    adminAccountingPurchaseOrder:",
  "th-leave"
)

patch(
  "    adminAttendance: 'လာရောက်မှု',\n    adminPayroll: 'လစာ',\n    adminPayrollDirectorOnly: 'လစာကြည့်ခြင်းကို Director များသာ ကြည့်နိုင်ပါသည်။',",
  "    adminAttendance: 'လာရောက်မှု',\n    adminAttendanceSub: 'Attendance အတည်ပြု၊ late/OT ချိန်ညှိ၊ အပတ်စဉ် schedule',\n    adminPayroll: 'လစာ',\n    adminPayrollSub: 'လစာတွက်၊ slip၊ ရုံးပိတ်ရက်၊ rule',\n    adminPayrollDirectorOnly: 'လစာကြည့်ခြင်းကို Director များသာ ကြည့်နိုင်ပါသည်။',\n    adminPayrollAccessDenied: 'လစာသည် home office/manager/franchisee အခွင့်အာဏာ လိုအပ်သည်',",
  "mm-att-pay"
)
patch(
  "    adminLeave: 'ခွင့်',\n    adminAccountingPurchaseOrder:",
  "    adminLeave: 'ခွင့်',\n    adminLeaveSub: 'ခွင့်အတည်ပြု/ငြင်းပယ် နှင့် သုံးစွဲ/ကျန်ရှိမှု',\n    adminAccountingPurchaseOrder:",
  "mm-leave"
)

patch(
  "    adminAttendance: 'ການມາວຽກ',\n    adminPayroll: 'ເງິນເດືອນ',\n    adminPayrollDirectorOnly: 'ເງິນເດືອນສາມາດເບິ່ງໄດ້ພຽງ Director ເທົ່ານັ້ນ.',",
  "    adminAttendance: 'ການມາວຽກ',\n    adminAttendanceSub: 'ອະນຸມັດມາວຽກ ປັບສາຍ/OT ແລະ ຕາຕະລາງອາທິດ',\n    adminPayroll: 'ເງິນເດືອນ',\n    adminPayrollSub: 'ຄິດໄລ່ເງິນເດືອນ slip ວັນພັກ rule',\n    adminPayrollDirectorOnly: 'ເງິນເດືອນສາມາດເບິ່ງໄດ້ພຽງ Director ເທົ່ານັ້ນ.',\n    adminPayrollAccessDenied: 'ຕ້ອງມີສິດສຳນັກງານໃຫຍ່/manager/franchisee',",
  "la-att-pay"
)
patch(
  "    adminLeave: 'ການລາພັກ',\n    adminAccountingPurchaseOrder:",
  "    adminLeave: 'ການລາພັກ',\n    adminLeaveSub: 'ອະນຸມັດ/ປະຕິເສດການລາ ແລະ ສະຖິຕິ',\n    adminAccountingPurchaseOrder:",
  "la-leave"
)

patch(
  "    adminAttendance: 'វត្តមាន',\n    adminLeave:",
  "    adminAttendance: 'វត្តមាន',\n    adminAttendanceSub: 'អនុម័តវត្តមាន កែ late/OT និងកាលវិភាគប្រចាំសប្តាហ៍',\n    adminPayrollSub: 'គណនាប្រាក់ខែ slip ថ្ងៃឈប់ rule',\n    adminPayrollAccessDenied: 'ត្រូវការសិទ្ធការិយាល័យ/អ្នកគ្រប់គ្រង/franchisee',\n    adminLeave:",
  "kh-att-pay"
)
patch(
  "    adminLeave: 'ការឈប់សម្រាក',\n    adminSectionLogistics:",
  "    adminLeave: 'ការឈប់សម្រាក',\n    adminLeaveSub: 'អនុម័ត/បដិសេធ និងស្ថិតិការប្រើ/នៅសល់',\n    adminSectionLogistics:",
  "kh-leave"
)

patch(
  "    adminAttendance: 'Chấm công',\n    adminLeave:",
  "    adminAttendance: 'Chấm công',\n    adminAttendanceSub: 'Duyệt chấm công, điều chỉnh muộn/OT và lịch tuần',\n    adminPayrollSub: 'Tính lương, phiếu lương, ngày lễ, quy tắc',\n    adminPayrollAccessDenied: 'Cần quyền văn phòng/quản lý/franchisee',\n    adminLeave:",
  "vi-att-pay"
)
patch(
  "    adminLeave: 'Nghỉ phép',\n    adminSectionLogistics:",
  "    adminLeave: 'Nghỉ phép',\n    adminLeaveSub: 'Duyệt/từ chối nghỉ và thống kê sử dụng/còn lại',\n    adminSectionLogistics:",
  "vi-leave"
)

patch(
  "    adminAttendance: 'Kehadiran',\n    adminLeave:",
  "    adminAttendance: 'Kehadiran',\n    adminAttendanceSub: 'Lulus kehadiran, laraskan lewat/OT dan jadual mingguan',\n    adminPayrollSub: 'Kira gaji, slip, cuti umum, peraturan',\n    adminPayrollAccessDenied: 'Perlu akses pejabat pusat/pengurus/franchisee',\n    adminLeave:",
  "ms-att-pay"
)
patch(
  "    adminLeave: 'Cuti',\n    adminSectionLogistics:",
  "    adminLeave: 'Cuti',\n    adminLeaveSub: 'Lulus/tolak cuti dan statistik penggunaan/baki',\n    adminSectionLogistics:",
  "ms-leave"
)

// help en block
patch(
  `    helpHow_admin_hr_policies:
      '① Enter title, attachment/body, and audience (all / head office / stores / individuals), then save.\\n② Use list filters, “View registered content”, and read details to verify.\\n③ Use “Targets & deploy (notice)” to publish and notify staff.',
    adminHrCalendar:`,
  `    helpHow_admin_hr_policies:
      '① Enter title, attachment/body, and audience (all / head office / stores / individuals), then save.\\n② Use list filters, “View registered content”, and read details to verify.\\n③ Use “Targets & deploy (notice)” to publish and notify staff.',
    helpSum_admin_hr:
      'HR hub — pending leave and attendance approvals, this week\u2019s HR events, and quick links to payroll, staff, and policies.',
    helpHow_admin_hr:
      '① Review KPI cards for pending counts and this week\u2019s schedule.\\n② Use each card\u2019s shortcut to open Leave, Attendance, Calendar, or Payroll.\\n③ Use the sub-navigation bar for Employees, Policies, Calendar, Attendance, Leave, and Payroll.',
    helpSum_admin_attendance:
      'Review and approve clock-in/out, adjust late/early/OT, view today\u2019s live status, and browse or edit weekly schedules in one place.',
    helpHow_admin_attendance:
      '① Records & approval: filter by period, store, employee, and status, then approve or adjust.\\n② Today live: see who is on shift now.\\n③ Schedule view / edit: review or edit weekly rosters.\\n④ Help tab: read approval, adjustment, and OT rules.',
    helpSum_admin_leave:
      'Approve or reject leave requests and review annual/sick/unpaid usage and balances by period.',
    helpHow_admin_leave:
      '① Approval: review certificates, then approve or reject pending requests.\\n② Stats: query usage and remaining leave by period and store.\\n③ Payroll may deep-link here by month.',
    helpSum_admin_hr_calendar:
      'View birthdays, hire dates, work anniversaries, and resignations on a monthly calendar and list.',
    helpHow_admin_hr_calendar:
      '① Filter by month, store, and event type.\\n② Click a calendar chip or list row to open the employee profile.\\n③ Use birthdays and anniversaries alongside store operations.',
    helpSum_admin_payroll:
      'Calculate and save payroll, view statements, salary change history, holidays, rules, and help in one place.',
    helpHow_admin_payroll:
      '① Payroll calc: pick month \u2192 Calculate \u2192 review \u2192 Save to DB.\\n② Records: view saved payroll, notify staff, export Excel.\\n③ Help tab: late, early, OT, and holiday rules.',
    adminHrCalendar:`,
  "en-help"
)

// help th/mm/la before adminHrCalendar
const helpGeneric = (sumHr, howHr) => `    helpSum_admin_hr:
      '${sumHr}',
    helpHow_admin_hr:
      '${howHr}',
    helpSum_admin_attendance:
      'Attendance records, approval, schedule view/edit in one place.',
    helpHow_admin_attendance:
      'Filter, approve, adjust; use Help tab for rules.',
    helpSum_admin_leave:
      'Approve/reject leave and view usage statistics.',
    helpHow_admin_leave:
      'Approval tab and Stats tab by period and store.',
    helpSum_admin_hr_calendar:
      'Monthly birthdays, hire dates, anniversaries, resignations.',
    helpHow_admin_hr_calendar:
      'Filter and click events to open employee profile.',
    helpSum_admin_payroll:
      'Calculate, save, view payroll records and rules.',
    helpHow_admin_payroll:
      'Calc tab, Records tab, Help tab for rules.',
    adminHrCalendar:`

patch(
  "    hrPolicyNeedsReconfirm: 'ต้องรับทราบอีกครั้ง',\n    adminHrCalendar:",
  helpGeneric(
    "ศูนย์ HR — การลา/มาทำงานรออนุมัติ และลิงก์ด่วน",
    "ดู KPI แล้วใช้ปุ่มลัดและเมนูย่อย"
  ),
  "th-help"
)
patch(
  "    hrPolicyNeedsReconfirm: 'ပြန်လည်အသိမှတ်',\n    adminHrCalendar:",
  helpGeneric("HR hub — pending & shortcuts", "Review KPI cards and sub-nav"),
  "mm-help"
)
patch(
  "    hrPolicyNeedsReconfirm: 'ຕ້ອງຮັບຮູ້ຄືນ',\n    adminHrCalendar:",
  helpGeneric("ສູນ HR — ລໍຖ້າ & ລິ້ງດ່ວນ", "ເບິ່ງ KPI ແລະເມນູຍ່ອຍ"),
  "la-help"
)
patch(
  "    adminHrPoliciesSub: 'ចុះបញ្ជី ផ្សព្វផ្សាយ និងតាមដានការអាន/ការទទួលយក (ទទួលឡើងវិញ) ចំពោះគោលការណ៍ធនធានមនុស្ស។',\n    homeSectionHrPolicies:",
  `    adminHrPoliciesSub: 'ចុះបញ្ជី ផ្សព្វផ្សាយ និងតាមដានការអាន/ការទទួលយក (ទទួលឡើងវិញ) ចំពោះគោលការណ៍ធនធានមនុស្ស។',
    helpSum_admin_hr: 'មជ្ឈមណ្ឌល HR — រង់ចាំ និងផ្លូវកាត់',
    helpHow_admin_hr: 'មើល KPI និងប្រើ nav រង',
    helpSum_admin_attendance: 'Attendance និង schedule',
    helpHow_admin_attendance: 'Filter, approve, adjust',
    helpSum_admin_leave: 'ច្បាប់ និងស្ថិតិ',
    helpHow_admin_leave: 'Approval និង Stats',
    helpSum_admin_hr_calendar: 'ប្រតិទិន HR',
    helpHow_admin_hr_calendar: 'Filter និងចុចបើកបុគ្គលិក',
    helpSum_admin_payroll: 'ប្រាក់ខែ',
    helpHow_admin_payroll: 'Calc, Records, Help',
    homeSectionHrPolicies:`,
  "kh-help"
)

// vi/ms help near adminHrCalendar
patch(
  "    adminHrCalendar: 'Lịch HR',\n    hrCalHint:",
  `    helpSum_admin_hr: 'Trang HR — chờ duyệt & liên kết nhanh',
    helpHow_admin_hr: 'Xem KPI và dùng sub-nav',
    helpSum_admin_attendance: 'Chấm công và lịch tuần',
    helpHow_admin_attendance: 'Lọc, duyệt, điều chỉnh',
    helpSum_admin_leave: 'Nghỉ phép và thống kê',
    helpHow_admin_leave: 'Tab duyệt và thống kê',
    helpSum_admin_hr_calendar: 'Lịch HR theo tháng',
    helpHow_admin_hr_calendar: 'Lọc và bấm mở hồ sơ NV',
    helpSum_admin_payroll: 'Lương',
    helpHow_admin_payroll: 'Tính, lưu, xem phiếu',
    adminHrCalendar: 'Lịch HR',
    hrCalHint:`,
  "vi-help"
)
patch(
  "    adminHrCalendar: 'Kalendar HR',\n    hrCalHint:",
  `    helpSum_admin_hr: 'Laman HR — menunggu & pintasan',
    helpHow_admin_hr: 'Lihat KPI dan sub-nav',
    helpSum_admin_attendance: 'Kehadiran dan jadual',
    helpHow_admin_attendance: 'Tapis, lulus, laraskan',
    helpSum_admin_leave: 'Cuti dan statistik',
    helpHow_admin_leave: 'Tab kelulusan dan statistik',
    helpSum_admin_hr_calendar: 'Kalendar HR bulanan',
    helpHow_admin_hr_calendar: 'Tapis dan klik profil pekerja',
    helpSum_admin_payroll: 'Gaji',
    helpHow_admin_payroll: 'Kira, simpan, rekod',
    adminHrCalendar: 'Kalendar HR',
    hrCalHint:`,
  "ms-help"
)

// update helpHow_admin_employees ko/en auto-load
patch(
  "① 직원 목록: 매장·직무·등급·재직(근무/휴직/퇴사 등)·검색어로 좁힌 뒤「조회」를 누릅니다.",
  "① 직원 목록: 화면 진입 시 재직 중 목록이 자동으로 불러와집니다. 매장·직무·등급·재직·검색어로 좁힌 뒤「조회」로 다시 적용할 수 있습니다.",
  "ko-emp-how"
)
patch(
  "① Employee list: narrow with store, job, grade, employment status, and search text, then press Query.",
  "① Employee list: active staff load automatically on entry. Narrow with store, job, grade, employment status, and search, then press Query to re-apply filters.",
  "en-emp-how"
)

writeI18nFileSync(filePath, s)
console.log("\nWrote", filePath)
