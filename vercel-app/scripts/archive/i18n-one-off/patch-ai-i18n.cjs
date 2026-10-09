/**
 * Patch i18n.ts: insert missing aiCenter* keys (from en) into th/mm/la/kh/vi/ms blocks.
 * Run: node scripts/patch-ai-i18n.cjs
 */
const fs = require("fs")
const path = require("path")

const i18nPath = path.join(__dirname, "../lib/i18n.ts")
let src = fs.readFileSync(i18nPath, "utf8")

function extractLangBlock(lang) {
  const marker = `\n  ${lang}: {`
  const start = src.indexOf(marker)
  if (start < 0) return { start: -1, end: -1, text: "" }
  let i = src.indexOf("{", start)
  let depth = 0
  const blockStart = i
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return { start: blockStart, end: i + 1, text: src.slice(blockStart, i + 1) }
    }
  }
  return { start: -1, end: -1, text: "" }
}

function extractAiKeys(blockText) {
  const keys = new Map()
  for (const m of blockText.matchAll(/^\s+(aiCenter[a-zA-Z0-9_]+):\s*(['"`])([\s\S]*?)\2,?$/gm)) {
    keys.set(m[1], m[3].replace(/\\n/g, "\n"))
  }
  // multiline values
  for (const m of blockText.matchAll(/^\s+(aiCenter[a-zA-Z0-9_]+):\s*\n\s*['"`]([\s\S]*?)['"`],?$/gm)) {
    keys.set(m[1], m[2].replace(/\\n/g, "\n"))
  }
  return keys
}

const koBlock = extractLangBlock("ko")
const enBlock = extractLangBlock("en")
const koKeys = extractAiKeys(koBlock.text)
const enKeys = extractAiKeys(enBlock.text)

const TRANSLATIONS = {
  th: {
    aiCenterLlmReady: "เชื่อมต่อโมเดล AI แล้ว (OpenAI API)",
    aiCenterLlmNotConfigured:
      "ยังไม่เชื่อมต่อโมเดล AI — ตั้งค่า OPENAI_API_KEY บน Vercel แล้ว deploy ใหม่ (ตอนนี้แสดงคำตอบแบบกฎเท่านั้น)",
    aiCenterTabDrafts: "ร่าง AI",
    aiCenterSuggestedQuestions: "คำถามแนะนำ",
    aiCenterDatePresetToday: "วันนี้",
    aiCenterDatePreset7d: "7 วันล่าสุด",
    aiCenterDatePreset30d: "30 วันล่าสุด",
    aiCenterDatePresetMonth: "เดือนนี้",
    aiCenterDatePresetPrevMonth: "เดือนที่แล้ว",
    aiCenterLlmReadyShort: "เชื่อมต่อ AI แล้ว",
    aiCenterLlmNotConfiguredShort: "ยังไม่เชื่อมต่อ AI",
    aiCenterStreaming: "สตรีมคำตอบ",
    aiCenterAdvancedJson: "ขั้นสูง: แก้ JSON โดยตรง",
    aiCenterCreateTaskFromPlan: "แผน → ร่างงานติดตาม",
    aiCenterCreateNoticeFromPlan: "แผน → ร่างประกาศ",
    aiCenterSuggestSalesRatio: "อัตราส่วนยอดขายต่อการส่งออกจากคลังสำนักงานใหญ่ของ {{store}} เดือนนี้?",
    aiCenterSuggestStaffing: "กำลังคนปัจจุบันเทียบเป้าหมายตามตำแหน่งของ {{store}}?",
    aiCenterSuggestWeather: "ข้อเสนอการดำเนินงาน {{store}} จากสภาพอากาศ/วันหยุดสัปดาห์นี้",
    aiCenterSuggestScreen: "ช่วยงานบนหน้าจอ {{path}}",
    aiCenterSuggestMultiStore: "เปรียบเทียบยอดขายและสัดส่วนการซื้อจากสำนักงานใหญ่ทุกสาขา",
    aiCenterAskDrawerTitle: "ถาม AI",
    aiCenterAskDrawerDesc: "ใช้สาขาและเดือนนี้ (กรุงเทพ) เปิดศูนย์ AI เต็มรูปแบบสำหรับฟีเจอร์ทั้งหมด",
    aiCenterOpenFullPage: "เปิดศูนย์ AI เต็มหน้าจอ",
    aiCenterHealthDbIssue: "ฐานข้อมูล AI ยังไม่ครบ",
    aiCenterHealthVectorPending: "Vector RAG ยังไม่พร้อม — รัน ai_knowledge_vector.sql และ backfill embedding",
    aiCenterDraftsHint: "ร่าง AI ที่อนุมัติ/รันแล้ว ตรวจสอบร่วมกับประกาศและบันทึกงาน",
    aiCenterDraftsNotices: "ร่างประกาศ",
    aiCenterDraftsTasks: "ร่างงานติดตาม",
    aiCenterDraftEmpty: "ไม่มีร่างให้แสดง",
    aiCenterGoNotices: "จัดการประกาศ",
    aiCenterGoWorkLog: "บันทึกงาน",
    aiCenterContinueNotice: "ไปเขียนประกาศต่อ",
    aiCenterContinueWorkLog: "เพิ่มในบันทึกงาน",
    aiCenterContinueOpen: "เปิดขั้นตอนถัดไป",
    aiCenterContinueAfterExecute: "ดำเนินการเสร็จแล้ว ตรวจสอบและส่งในหน้าถัดไป",
    aiCenterConversationHistory: "บทสนทนาล่าสุด",
    aiCenterCreateNoticeFromAnswer: "คำตอบ → ร่างประกาศ",
    aiCenterCreateTaskFromAnswer: "คำตอบ → ร่างงานติดตาม",
    aiCenterFromAnswerNoticeTitle: "ประกาศจากคำตอบ AI",
    aiCenterFromAnswerTaskTitle: "งานติดตามจากคำตอบ AI",
    aiCenterShowJson: "แสดงตัวแก้ JSON",
    aiCenterHideJson: "ซ่อนตัวแก้ JSON",
    aiCenterMetricSales: "ยอดขาย",
    aiCenterMetricHqPurchase: "ส่งออกสำนักงานใหญ่ (ซื้อ)",
    aiCenterMetricRatio: "สัดส่วนซื้อ",
    aiCenterMetricOrders: "ออเดอร์เสร็จ",
    aiCenterStreamToggle: "ใช้การสตรีมคำตอบ",
    aiCenterFormTitle: "หัวข้อ",
    aiCenterFormContent: "เนื้อหา",
    aiCenterFormTaskTitle: "ชื่องาน",
    aiCenterFormDescription: "รายละเอียด",
    aiCenterFormOwner: "ผู้รับผิดชอบ",
    aiCenterFormDueDate: "กำหนดเสร็จ",
    aiCenterFormTaskId: "รหัสงาน",
    aiCenterFormStatus: "สถานะ",
    aiCenterFormStatusTodo: "รอดำเนินการ",
    aiCenterFormStatusInProgress: "กำลังดำเนินการ",
    aiCenterFormStatusReview: "ตรวจสอบ",
    aiCenterFormStatusDone: "เสร็จ",
    aiCenterFormStatusCancelled: "ยกเลิก",
    aiCenterFormYearMonth: "ปี-เดือน (YYYY-MM)",
    aiCenterFormFilingType: "ประเภทการยื่น",
    aiCenterFormNote: "หมายเหตุ",
    aiCenterApproveCommentPlaceholder: "หมายเหตุอนุมัติ/ปฏิเสธ (ไม่บังคับ)",
    aiCenterStoreAll: "ทุกสาขา",
    helpSum_admin_ai_center:
      "ถามคำถามจากข้อมูล ERP ความรู้ภายใน และสภาพอากาศ/วันหยุด แล้วรันการทำงานหลังอนุมัติจากศูนย์ AI",
    helpHow_admin_ai_center:
      "① แท็บถาม-ตอบ: เลือกสาขา ช่วงวันที่ (กรุงเทพ) และประเภทคำถาม แล้วสร้างคำตอบ AI\n② จากแผนแนะนำ ไปต่อที่ร่างงานติดตามหรือร่างประกาศ\n③ แท็บร่างการดำเนินการ: สร้างคำขออนุมัติ ผู้จัดการอนุมัติและรันจากรอดำเนินการ\n④ แท็บร่าง AI: ตรวจร่างประกาศ/งานและเชื่อมกับประกาศหรือบันทึกงาน",
  },
  mm: {
    aiCenterApplyStoreFilter: "ဆိုင်စစ်ထုတ်မှု သုံးမည်",
    aiCenterApprovalConflict: "တောင်းဆိုမှုကို အခြားသူ 처리ပြီး။ စာရင်းကို refresh လုပ်ပါ။",
    aiCenterApproveCommentPlaceholder: "အတည်ပြု/ငြင်းပယ်မှတ်ချက် (ရွေးချယ်နိုင်)",
    aiCenterApproverOnlyHint: "အတည်ပြု/လုပ်ဆောင်ခြင်းကို ရုံးချုပ်/မန်နေဂျာ/စာရင်းကိုင်သာ လုပ်နိုင်သည်။",
    aiCenterTabDrafts: "AI မူကြမ်း",
    aiCenterSuggestedQuestions: "အကြံပြုမေးခွန်းများ",
    aiCenterDatePresetToday: "ယနေ့",
    aiCenterDatePreset7d: "နောက်ဆုံး ၇ ရက်",
    aiCenterDatePreset30d: "နောက်ဆုံး ၃၀ ရက်",
    aiCenterDatePresetMonth: "ယခုလ",
    aiCenterDatePresetPrevMonth: "ယခင်လ",
    aiCenterLlmReadyShort: "AI ချိတ်ဆက်ထား",
    aiCenterLlmNotConfiguredShort: "AI မချိတ်ဆက်ရသေး",
    aiCenterStreaming: "စ트รီမ်း အဖြေ",
    aiCenterAdvancedJson: "အဆင့်: JSON တိုက်ရိုက်ပြင်",
    aiCenterCreateTaskFromPlan: "အစီအစဉ် → နောက်လိုက်လုပ်ငန်း မူကြမ်း",
    aiCenterCreateNoticeFromPlan: "အစီအစဉ် → ကြေညာချက် မူကြမ်း",
    aiCenterSuggestSalesRatio: "{{store}} ယခုလ ရောင်းအားနှင့် ရုံးချုပ် ဂိုဒေါင်ထွက်(ဝယ်ယူ) အချိုး?",
    aiCenterSuggestStaffing: "{{store}} ရာထူးအလိုက် လက်ရှိ/ပစ်မှတ်လူအား?",
    aiCenterSuggestWeather: "ဒီအပတ် {{store}} ရာသီဥတု/ရုံးပိတ်ရက် အကြံပြုချက်",
    aiCenterSuggestScreen: "{{path}} မျက်နှာပြင်အလုပ်ကို ကူညီပါ",
    aiCenterSuggestMultiStore: "ဆိုင်အားလုံး ရောင်းအား·ရုံးဝယ်ယူအချိုးကို နှိုင်းယှဉ်ပါ",
    aiCenterAskDrawerTitle: "AI ကို မေးပါ",
    aiCenterAskDrawerDesc: "လက်ရှိဆိုင်နှင့် ယခုလ (ဘန်ကောက်)။ အပြည့်အစ AI စင်တာကို ဖွင့်ပါ။",
    aiCenterOpenFullPage: "AI စင်တာ အပြည့်အစ",
    aiCenterHealthDbIssue: "AI DB အခြေခံ မပြည့်စုံ",
    aiCenterHealthVectorPending: "Vector RAG မပြင်ဆင်ရသေး — ai_knowledge_vector.sql နှင့် embedding backfill",
    aiCenterDraftsHint: "အတည်ပြု/လုပ်ဆောင်ပြီး AI မူကြမ်းများ။ ကြေညာချက်နှင့် အလုပ်မှတ်နှင့် တွဲဖက် စစ်ဆေးပါ။",
    aiCenterDraftsNotices: "ကြေညာချက် မူကြမ်း",
    aiCenterDraftsTasks: "နောက်လိုက်လုပ်ငန်း မူကြမ်း",
    aiCenterDraftEmpty: "ြသရန် မူကြမ်း မရှိ",
    aiCenterGoNotices: "ကြေညာချက်",
    aiCenterGoWorkLog: "အလုပ်မှတ်",
    aiCenterContinueNotice: "ကြေညာချက်ရေးသို့ ဆက်လက်",
    aiCenterContinueWorkLog: "အလုပ်မှတ်သို့ ထည့်",
    aiCenterContinueOpen: "နောက်တစ်ဆင့်ဖွင့်",
    aiCenterContinueAfterExecute: "လုပ်ဆောင်ပြီး။ နောက်မျက်နှာတွင် စစ်ပြီး ပို့ပါ။",
    aiCenterConversationHistory: "မကြာသေးမီ စကားပြော",
    aiCenterCreateNoticeFromAnswer: "အဖြေ → ကြေညာချက် မူကြမ်း",
    aiCenterCreateTaskFromAnswer: "အဖြေ → နောက်လိုက်လုပ်ငန်း မူကြမ်း",
    aiCenterFromAnswerNoticeTitle: "AI အဖြေမှ ကြေညာချက်",
    aiCenterFromAnswerTaskTitle: "AI အဖြေမှ နောက်လိုက်လုပ်ငန်း",
    aiCenterShowJson: "JSON editor ပြပါ",
    aiCenterHideJson: "JSON editor ဝှက်ပါ",
    aiCenterMetricSales: "ရောင်းအား",
    aiCenterMetricHqPurchase: "ရုံးချုပ် ထွက်(ဝယ်)",
    aiCenterMetricRatio: "ဝယ်ယူအချိုး",
    aiCenterMetricOrders: "ပြီးမြောက်အမှာစာ",
    aiCenterStreamToggle: "စ트รီမ်း အဖြေ သုံးမည်",
    aiCenterFormTitle: "ခေါင်းစဉ်",
    aiCenterFormContent: "အကြောင်းအရာ",
    aiCenterFormTaskTitle: "လုပ်ငန်းခေါင်းစဉ်",
    aiCenterFormDescription: "ဖော်ပြချက်",
    aiCenterFormOwner: "တာဝန်ခံ",
    aiCenterFormDueDate: "နောက်ဆုံးရက်",
    aiCenterFormTaskId: "လုပ်ငန်း ID",
    aiCenterFormStatus: "အခြေအနေ",
    aiCenterFormStatusTodo: "စောင့်ဆိုင်း",
    aiCenterFormStatusInProgress: "လုပ်ဆောင်နေ",
    aiCenterFormStatusReview: "စစ်ဆေး",
    aiCenterFormStatusDone: "ပြီး",
    aiCenterFormStatusCancelled: "ပယ်ဖျက်",
    aiCenterFormYearMonth: "နှစ်-လ (YYYY-MM)",
    aiCenterFormFilingType: "တင်သွင်းအမျိုးအစား",
    aiCenterFormNote: "မှတ်ချက်",
    aiCenterStoreAll: "ဆိုင်အားလုံး",
    aiCenterLlmReady: "AI မော်ဒယ် ချိတ်ဆက်ထား (OpenAI API)",
    aiCenterLlmNotConfigured: "AI မော်ဒယ် မချိတ်ဆက်ရသေး — OPENAI_API_KEY သတ်မှတ်ပြီး redeploy လုပ်ပါ",
  },
  la: {
    aiCenterApplyStoreFilter: "ໃຊ້ຕົວກອງສາຂາ",
    aiCenterApprovalConflict: "ຄຳຂໍນີ້ຖືກດຳເນີນການແລ້ວ — ຣີເຟຣຊລາຍການ",
    aiCenterApproveCommentPlaceholder: "ໝາຍເຫດອະນຸມັດ/ປະຕິເສດ (ທາງເລືອກ)",
    aiCenterApproverOnlyHint: "ອະນຸມັດ/ຮັນໄດ້ສະເພາະສຳນັກງານໃຫຍ່/ຜູ້ຈັດການ/ບັນຊີ",
    aiCenterTabDrafts: "ຮ່າງ AI",
    aiCenterSuggestedQuestions: "ຄຳຖາມແນະນຳ",
    aiCenterDatePresetToday: "ມື້ນີ້",
    aiCenterDatePreset7d: "7 ວັນລ່າສຸດ",
    aiCenterDatePreset30d: "30 ວັນລ່າສຸດ",
    aiCenterDatePresetMonth: "ເດືອນນີ້",
    aiCenterDatePresetPrevMonth: "ເດືອນກ່ອນ",
    aiCenterLlmReadyShort: "ເຊື່ອມ AI ແລ້ວ",
    aiCenterLlmNotConfiguredShort: "ຍັງບໍ່ເຊື່ອມ AI",
    aiCenterStreaming: "ສະຕຣີມຄຳຕອບ",
    aiCenterAdvancedJson: "ຂັ້ນສູງ: ແກ້ JSON",
    aiCenterCreateTaskFromPlan: "ແຜນ → ຮ່າງວຽກຕິດຕາມ",
    aiCenterCreateNoticeFromPlan: "ແຜນ → ຮ່າງປະກາດ",
    aiCenterSuggestSalesRatio: "ອັດຕາສ່ວນຂາຍ/ສົ່ງອອກຄັງສຳນັກງານໃຫຍ່ {{store}} ເດືອນນີ້?",
    aiCenterSuggestStaffing: "ກຳລັງຄົນ {{store}} ເທົ່າກັບເປົ້າໝາຍ?",
    aiCenterSuggestWeather: "ຂໍ້ແນະນຳ {{store}} ຈາກອາກາດ/ວັນພັກອາທິດນີ້",
    aiCenterSuggestScreen: "ຊ່ວຍງານໜ້າ {{path}}",
    aiCenterSuggestMultiStore: "ປຽບທຽບຍອດຂາຍ·ສັດສ່ວນຊື້ສຳນັກງານໃຫຍ່ທຸກສາຂາ",
    aiCenterAskDrawerTitle: "ຖາມ AI",
    aiCenterAskDrawerDesc: "ໃຊ້ສາຂາແລະເດືອນນີ້ (ກຸງເທບ) — ເປີດສູນ AI ເຕັມຈໍ",
    aiCenterOpenFullPage: "ເປີດສູນ AI ເຕັມ",
    aiCenterHealthDbIssue: "ຖານຂໍ້ມູນ AI ຍັງບໍ່ຄົບ",
    aiCenterHealthVectorPending: "Vector RAG ຍັງບໍ່ພ້ອມ — ຮັນ ai_knowledge_vector.sql",
    aiCenterDraftsHint: "ຮ່າງ AI ທີ່ອະນຸມັດ/ຮັນແລ້ວ — ກວດຄູ່ປະກາດແລະບັນທຶກວຽກ",
    aiCenterDraftsNotices: "ຮ່າງປະກາດ",
    aiCenterDraftsTasks: "ຮ່າງວຽກຕິດຕາມ",
    aiCenterDraftEmpty: "ບໍ່ມີຮ່າງ",
    aiCenterGoNotices: "ປະກາດ",
    aiCenterGoWorkLog: "ບັນທຶກວຽກ",
    aiCenterContinueNotice: "ໄປຂຽນປະກາດຕໍ່",
    aiCenterContinueWorkLog: "ເພີ່ມໃນບັນທຶກວຽກ",
    aiCenterContinueOpen: "ເປີດຂັ້ນຕອນຖັດໄປ",
    aiCenterContinueAfterExecute: "ຮັນແລ້ວ — ກວດແລະສົ່ງໃນໜ້າຖັດໄປ",
    aiCenterConversationHistory: "ການສົນທະນາລ່າສຸດ",
    aiCenterCreateNoticeFromAnswer: "ຄຳຕອບ → ຮ່າງປະກາດ",
    aiCenterCreateTaskFromAnswer: "ຄຳຕອບ → ຮ່າງວຽກຕິດຕາມ",
    aiCenterFromAnswerNoticeTitle: "ປະກາດຈາກຄຳຕອບ AI",
    aiCenterFromAnswerTaskTitle: "ວຽກຕິດຕາມຈາກຄຳຕອບ AI",
    aiCenterShowJson: "ສະແດງ JSON",
    aiCenterHideJson: "ເຊື່ອນ JSON",
    aiCenterMetricSales: "ຍອດຂາຍ",
    aiCenterMetricHqPurchase: "ສົ່ງອອກສຳນັກງານໃຫຍ່",
    aiCenterMetricRatio: "ອັດຕາຊື້",
    aiCenterMetricOrders: "ອໍເດີສຳເລັດ",
    aiCenterStreamToggle: "ໃຊ້ສະຕຣີມ",
    aiCenterFormTitle: "ຫົວຂໍ້",
    aiCenterFormContent: "ເນື້ອຫາ",
    aiCenterFormTaskTitle: "ຫົວຂໍ້ວຽກ",
    aiCenterFormDescription: "ລາຍລະອຽດ",
    aiCenterFormOwner: "ຜູ້ຮັບຜິດຊອບ",
    aiCenterFormDueDate: "ກຳນົດເສັດ",
    aiCenterFormTaskId: "ID ວຽກ",
    aiCenterFormStatus: "ສະຖານະ",
    aiCenterFormStatusTodo: "ລໍຖ້າ",
    aiCenterFormStatusInProgress: "ກຳລັງດຳເນີນ",
    aiCenterFormStatusReview: "ກວດສອບ",
    aiCenterFormStatusDone: "ສຳເລັດ",
    aiCenterFormStatusCancelled: "ຍົກເລີກ",
    aiCenterFormYearMonth: "ປີ-ເດືອນ (YYYY-MM)",
    aiCenterFormFilingType: "ປະເພດຍື່ນ",
    aiCenterFormNote: "ໝາຍເຫດ",
    aiCenterStoreAll: "ທຸກສາຂາ",
    aiCenterLlmReady: "ເຊື່ອມໂມເດວ AI (OpenAI API)",
    aiCenterLlmNotConfigured: "ຍັງບໍ່ເຊື່ອມ AI — ຕັ້ງ OPENAI_API_KEY",
  },
}

// kh, vi, ms: localized supplements
TRANSLATIONS.kh = { ...Object.fromEntries(enKeys), ...{
  aiCenterSubtitle: "គ្រប់គ្រងសំណួរ/សំណូមពរ និងការអនុម័ត AI ក្នុងកន្លែងតែមួយ",
  aiCenterTabQa: "សួរ / សំណូមពរ",
  aiCenterTabActions: "ព្រាងសកម្មភាព",
  aiCenterTabApprovals: "រង់ចាំ / ប្រវត្តិ",
  aiCenterTabMetrics: "គុណភាព & ថ្លៃដើម",
  aiCenterTabDrafts: "ព្រាង AI",
  aiCenterAskDrawerTitle: "សួរ AI",
  aiCenterOpenFullPage: "បើកមជ្ឈមណ្ឌល AI ពេញ",
  aiCenterContinueNotice: "បន្តសរសេរសេចក្តីជូនដំណឹង",
  aiCenterContinueWorkLog: "បន្ថែមក្នុងកំណត់ត្រាការងារ",
  aiCenterConversationHistory: "ការសន្ទនាថ្មីៗ",
  aiCenterMetricSales: "លក់",
  aiCenterMetricHqPurchase: "ចេញឃ្លាំងកental",
  aiCenterMetricRatio: "សមាមាត្រទិញ",
  aiCenterMetricOrders: "បញ្ជាទិញបញ្ចប់",
}}
TRANSLATIONS.vi = { ...Object.fromEntries(enKeys), ...{
  aiCenterSubtitle: "Quản lý hỏi đáp, đề xuất và thực thi AI sau phê duyệt tại một nơi.",
  aiCenterTabQa: "Hỏi đáp / Đề xuất",
  aiCenterTabActions: "Bản nháp hành động",
  aiCenterTabApprovals: "Chờ / Lịch sử",
  aiCenterTabMetrics: "Chất lượng & Chi phí",
  aiCenterTabDrafts: "Bản nháp AI",
  aiCenterAskDrawerTitle: "Hỏi AI",
  aiCenterOpenFullPage: "Mở Trung tâm AI đầy đủ",
  aiCenterContinueNotice: "Tiếp tục soạn thông báo",
  aiCenterContinueWorkLog: "Thêm vào nhật ký công việc",
  aiCenterConversationHistory: "Hội thoại gần đây",
  aiCenterMetricSales: "Doanh thu",
  aiCenterMetricHqPurchase: "Xuất kho HQ (mua)",
  aiCenterMetricRatio: "Tỷ lệ mua",
  aiCenterMetricOrders: "Đơn hoàn thành",
  aiCenterDatePreset30d: "30 ngày qua",
  aiCenterSuggestMultiStore: "So sánh doanh thu và tỷ lệ mua HQ tất cả cửa hàng",
}}
TRANSLATIONS.ms = { ...Object.fromEntries(enKeys), ...{
  aiCenterSubtitle: "Urus soal jawab, cadangan dan laksana AI selepas kelulusan di satu tempat.",
  aiCenterTabQa: "Soal jawab / Cadangan",
  aiCenterTabActions: "Draf tindakan",
  aiCenterTabApprovals: "Menunggu / Sejarah",
  aiCenterTabMetrics: "Kualiti & Kos",
  aiCenterTabDrafts: "Draf AI",
  aiCenterAskDrawerTitle: "Tanya AI",
  aiCenterOpenFullPage: "Buka Pusat AI penuh",
  aiCenterContinueNotice: "Teruskan ke notis",
  aiCenterContinueWorkLog: "Tambah ke log kerja",
  aiCenterConversationHistory: "Perbualan terkini",
  aiCenterMetricSales: "Jualan",
  aiCenterMetricHqPurchase: "Keluar HQ (belian)",
  aiCenterMetricRatio: "Nisbah belian",
  aiCenterMetricOrders: "Pesanan selesai",
  aiCenterDatePreset30d: "30 hari lepas",
  aiCenterSuggestMultiStore: "Bandingkan jualan vs nisbah belian HQ semua kedai",
}}

// Remove auto-fill loop
// for (const lang of ["kh", "vi", "ms"]) { ... }

function escapeStr(s) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")
}

function formatEntry(key, value) {
  if (value.includes("\n")) {
    return `    ${key}:\n      '${escapeStr(value)}',`
  }
  return `    ${key}: '${escapeStr(value)}',`
}

const TARGET_LANGS = ["kh", "vi", "ms"]
let totalAdded = 0

for (const lang of TARGET_LANGS) {
  const block = extractLangBlock(lang)
  if (block.start < 0) {
    console.warn("skip", lang, "no block")
    continue
  }
  const existing = extractAiKeys(block.text)
  const lines = []
  for (const [key] of koKeys) {
    if (existing.has(key)) continue
    const val =
      (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) ||
      enKeys.get(key) ||
      koKeys.get(key)
    if (!val) continue
    lines.push(formatEntry(key, val))
  }
  if (lines.length === 0) {
    console.log(lang, "ok")
    continue
  }
  const anchorCandidates = [
    "    aiCenterSampleAccountingNote:",
    "    aiCenterApplyStoreFilter:",
    "    aiCenter:",
  ]
  let idx = -1
  let idxEnd = -1
  for (const anchor of anchorCandidates) {
    const pos = src.indexOf(anchor, block.start)
    if (pos >= 0 && pos < block.end) {
      idx = pos
      idxEnd = src.indexOf("\n", idx)
      break
    }
  }
  if (idx < 0) {
    console.warn(lang, "anchor not found")
    continue
  }
  const insert = "\n" + lines.join("\n")
  src = src.slice(0, idxEnd) + insert + src.slice(idxEnd)
  totalAdded += lines.length
  console.log(lang, "added", lines.length)
}

if (totalAdded > 0) {
  fs.writeFileSync(i18nPath, src, "utf8")
  console.log("total added", totalAdded)
} else {
  console.log("nothing to add")
}
