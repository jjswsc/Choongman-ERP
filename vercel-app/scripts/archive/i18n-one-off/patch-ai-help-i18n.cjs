const fs = require("fs")
const path = require("path")
const file = path.join(__dirname, "../lib/i18n.ts")
let src = fs.readFileSync(file, "utf8")

const HELP = {
  kh: {
    sum: "សួរលើទិន្នន័យ ERP ចំណេះដឹងខាងក្នុng និងអាកាសធាតុ/ថ្ងៃឈប់សម្រាក រួចដំណើរការក្រោយអនុម័តពីមជ្ឈមណ្ឌល AI",
    how: "① Q&A: ជ្រើសហាង ចន្លោះថ្ងៃ (Bangkok) intent រួចបង្កើតចម្លើយ AI\n② ពីផែនការណែនាំ បន្តទៅព្រាងកិច្ចការ/សេចក្តីជូនដំណឹng\n③ Action drafts: បង្កើតសំណើអនុម័ត\n④ AI drafts: ពិនិត្យព្រាង និងភ្ជាប់ Notices/Work log\n⑤ Recent conversations\n⑥ Open next step បន្ទាប់ពីអនុម័ត",
    after: "adminNotices: 'សេចក្តីជូនដំណឹng'",
  },
  vi: {
    sum: "Hỏi đáp dựa trên dữ liệu ERP, tri thức nội bộ và thời tiết/ngày nghỉ; thực thi sau phê duyệt tại Trung tâm AI.",
    how: "① Q&A: chọn cửa hàng, khoảng ngày (Bangkok), intent rồi tạo câu trả lời AI.\n② Từ kế hoạch đề xuất, tiếp tục sang bản nháp công việc/thông báo.\n③ Action drafts: tạo yêu cầu phê duyệt.\n④ AI drafts: xem bản nháp và liên kết Notices/Work log.\n⑤ Tải lại câu hỏi từ Hội thoại gần đây.\n⑥ Sau phê duyệt, dùng Open next step để prefill.",
    after: "adminNotices: 'Thông báo'",
  },
  ms: {
    sum: "Tanya soalan menggunakan data ERP, pengetahuan dalaman, dan cuaca/cuti; laksana selepas kelulusan di Pusat AI.",
    how: "① Q&A: pilih kedai, julat tarikh (Bangkok), intent kemudian jana jawapan AI.\n② Daripada pelan cadangan, sambung ke draf tugasan/notis.\n③ Action drafts: cipta permintaan kelulusan.\n④ AI drafts: semak draf dan sambung ke Notices/Work log.\n⑤ Muat semula soalan dari Perbualan terkini.\n⑥ Selepas kelulusan, guna Open next step untuk prefill.",
    after: "adminNotices: 'Notis'",
  },
}

for (const [lang, { sum, how, after }] of Object.entries(HELP)) {
  if (src.includes(`helpSum_admin_ai_center:`) && src.includes(after)) {
    const needle = `    aiCenterApproveCommentPlaceholder: 'Approval/rejection note (optional)',\n    ${after}`
    if (!src.includes(needle)) {
      console.warn(lang, "needle not found")
      continue
    }
    if (src.includes(needle.replace(after, `helpSum_admin_ai_center:`))) {
      console.log(lang, "already has help")
      continue
    }
    const insert = `    aiCenterApproveCommentPlaceholder: 'Approval/rejection note (optional)',\n    helpSum_admin_ai_center:\n      '${sum.replace(/'/g, "\\'")}',\n    helpHow_admin_ai_center:\n      '${how.replace(/'/g, "\\'")}',\n    ${after}`
    src = src.replace(needle, insert)
    console.log(lang, "patched help")
  }
}

fs.writeFileSync(file, src, "utf8")
