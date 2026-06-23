import { isLangCode, type LangCode } from "@/lib/lang-context"

type RuntimeUiStringKey =
  | "cancel"
  | "btn_ok"
  | "appDialogAlertTitle"
  | "appDialogConfirmTitle"
  | "posCustomerMemo"
  | "posTable"
  | "posOrderGuestCount"
  | "posKitchenFullCancelBanner"
  | "posKitchenPartialReprintBanner"
  | "posPrintCutFailedDetail"
  | "posPrintFailedWithReason"
  | "posPrintRequestError"
  | "posKitchenOrder"
  | "posKitchen1"
  | "posKitchen2"
  | "posKitchen3"
  | "posOrderTypeDineIn"
  | "posOrderTypeTakeout"
  | "posOrderTypeDelivery"
  | "posMemberPortalOrder"
  | "posMemberPortalOrderNotice"
  | "posMemberPortalPaymentPending"
  | "posPickupAtShort"
  | "posMember"
  | "posMemberNo"
  | "posCoupon"
  | "posPointsShort"

const RUNTIME_UI_STRINGS: Record<LangCode, Record<RuntimeUiStringKey, string>> = {
  ko: {
    cancel: "취소",
    btn_ok: "확인",
    appDialogAlertTitle: "알림",
    appDialogConfirmTitle: "확인",
    posCustomerMemo: "손님 메모",
    posTable: "테이블",
    posOrderGuestCount: "손님 수",
    posKitchenFullCancelBanner: "전체 취소·주방 확인",
    posKitchenPartialReprintBanner: "일부 취소 반영·현재 주문",
    posPrintCutFailedDetail: "인쇄는 완료되었으나 용지 자동 절단에 실패했습니다.{detail}",
    posPrintFailedWithReason: "인쇄에 실패했습니다: {reason}",
    posPrintRequestError: "인쇄 요청 중 오류가 발생했습니다.",
    posKitchenOrder: "주방 주문서",
    posKitchen1: "주방 1",
    posKitchen2: "주방 2",
    posKitchen3: "주방 3",
    posOrderTypeDineIn: "매장",
    posOrderTypeTakeout: "포장",
    posOrderTypeDelivery: "배달",
    posMemberPortalOrder: "회원주문",
    posMemberPortalOrderNotice: "회원 주문입니다",
    posMemberPortalPaymentPending: "결제대기",
    posPickupAtShort: "픽업",
    posMember: "회원",
    posMemberNo: "회원번호",
    posCoupon: "쿠폰",
    posPointsShort: "포인트",
  },
  en: {
    cancel: "Cancel",
    btn_ok: "OK",
    appDialogAlertTitle: "Notice",
    appDialogConfirmTitle: "Please confirm",
    posCustomerMemo: "Customer Memo",
    posTable: "Table",
    posOrderGuestCount: "Guests",
    posKitchenFullCancelBanner: "Order fully cancelled — kitchen check",
    posKitchenPartialReprintBanner: "Order updated (partial cancel)",
    posPrintCutFailedDetail: "Printing finished, but automatic paper cut failed.{detail}",
    posPrintFailedWithReason: "Printing failed: {reason}",
    posPrintRequestError: "An error occurred while requesting print.",
    posKitchenOrder: "Kitchen Order",
    posKitchen1: "Kitchen 1",
    posKitchen2: "Kitchen 2",
    posKitchen3: "Kitchen 3",
    posOrderTypeDineIn: "Dine-in",
    posOrderTypeTakeout: "Takeout",
    posOrderTypeDelivery: "Delivery",
    posMemberPortalOrder: "Member order",
    posMemberPortalOrderNotice: "This is a member order",
    posMemberPortalPaymentPending: "Payment pending",
    posPickupAtShort: "Pickup",
    posMember: "Member",
    posMemberNo: "Member no",
    posCoupon: "Coupon",
    posPointsShort: "Points",
  },
  th: {
    cancel: "ยกเลิก",
    btn_ok: "ตกลง",
    appDialogAlertTitle: "แจ้ง",
    appDialogConfirmTitle: "ยืนยัน",
    posCustomerMemo: "บันทึกลูกค้า",
    posTable: "โต๊ะ",
    posOrderGuestCount: "จำนวนลูกค้า",
    posKitchenFullCancelBanner:
      "ยกเลิกออเดอร์ทั้งหมด — แจ้งครัว\nCANCEL ALL ORDERS — NOTIFY KITCHEN (DO NOT COOK)",
    posKitchenPartialReprintBanner:
      "อัปเดตหลังยกเลิกบางรายการ (ออเดอร์ปัจจุบัน)\nORDER UPDATED — CANCELLED LINES ABOVE; DO NOT PREPARE",
    posPrintCutFailedDetail: "พิมพ์เสร็จแล้ว แต่การตัดกระดาษอัตโนมัติล้มเหลว{detail}",
    posPrintFailedWithReason: "การพิมพ์ล้มเหลว: {reason}",
    posPrintRequestError: "เกิดข้อผิดพลาดขณะส่งคำขอพิมพ์",
    posKitchenOrder: "สลิปครัว",
    posKitchen1: "ครัว 1",
    posKitchen2: "ครัว 2",
    posKitchen3: "ครัว 3",
    posOrderTypeDineIn: "ทานที่ร้าน",
    posOrderTypeTakeout: "ซื้อกลับบ้าน",
    posOrderTypeDelivery: "เดลิเวอรี",
    posMemberPortalOrder: "สั่งซื้อสมาชิก",
    posMemberPortalOrderNotice: "คำสั่งซื้อสมาชิก",
    posMemberPortalPaymentPending: "รอชำระเงิน",
    posPickupAtShort: "รับสินค้า",
    posMember: "สมาชิก",
    posMemberNo: "เลขสมาชิก",
    posCoupon: "คูปอง",
    posPointsShort: "คะแนน",
  },
  mm: {
    cancel: "ပယ်ဖျက်မည်",
    btn_ok: "အတည်ပြု",
    appDialogAlertTitle: "အသိပေးချက်",
    appDialogConfirmTitle: "အတည်ပြုပါ",
    posCustomerMemo: "ဖောက်သည်မှတ်ချက်",
    posTable: "စားပွဲ",
    posOrderGuestCount: "ဧည့်သည်ဦးရေ",
    posKitchenFullCancelBanner: "Order fully cancelled — kitchen check",
    posKitchenPartialReprintBanner: "တစ်စိတ် ပယ်ပြီးနောက် ပြင်ဆင်ထားသော အော်ဒါ",
    posPrintCutFailedDetail: "Printing finished, but automatic paper cut failed.{detail}",
    posPrintFailedWithReason: "Printing failed: {reason}",
    posPrintRequestError: "An error occurred while requesting print.",
    posKitchenOrder: "မီးဖိုချောင်စလစ်",
    posKitchen1: "မီးဖိုချောင် 1",
    posKitchen2: "မီးဖိုချောင် 2",
    posKitchen3: "Kitchen 3",
    posOrderTypeDineIn: "ဆိုင်တွင်စားမည်",
    posOrderTypeTakeout: "ထုပ်ယူ",
    posOrderTypeDelivery: "ပို့ဆောင်",
    posMemberPortalOrder: "Member order",
    posMemberPortalOrderNotice: "This is a member order",
    posMemberPortalPaymentPending: "Payment pending",
    posPickupAtShort: "Pickup",
    posMember: "Member",
    posMemberNo: "Member no",
    posCoupon: "Coupon",
    posPointsShort: "Points",
  },
  la: {
    cancel: "ຍົກເລີກ",
    btn_ok: "ຕົກລົງ",
    appDialogAlertTitle: "ແຈ້ງ",
    appDialogConfirmTitle: "ຢືນຢັນ",
    posCustomerMemo: "ໝາຍເຫດລູກຄ້າ",
    posTable: "ໂຕະ",
    posOrderGuestCount: "ຈຳນວນລູກຄ້າ",
    posKitchenFullCancelBanner: "Order fully cancelled — kitchen check",
    posKitchenPartialReprintBanner: "ອັບເດດຫຼັງຍົກເລີກບາງລາຍການ (ອໍເດີປັດຈຸບັນ)",
    posPrintCutFailedDetail: "Printing finished, but automatic paper cut failed.{detail}",
    posPrintFailedWithReason: "Printing failed: {reason}",
    posPrintRequestError: "An error occurred while requesting print.",
    posKitchenOrder: "ໃບຄົວ",
    posKitchen1: "ຄົວ 1",
    posKitchen2: "ຄົວ 2",
    posKitchen3: "ຄົວ 3",
    posOrderTypeDineIn: "ນັ່ງກິນໃນຮ້ານ",
    posOrderTypeTakeout: "ຫໍ່ກັບ",
    posOrderTypeDelivery: "ຈັດສົ່ງ",
    posMemberPortalOrder: "Member order",
    posMemberPortalOrderNotice: "This is a member order",
    posMemberPortalPaymentPending: "Payment pending",
    posPickupAtShort: "Pickup",
    posMember: "Member",
    posMemberNo: "Member no",
    posCoupon: "Coupon",
    posPointsShort: "Points",
  },
  kh: {
    cancel: "បោះបង់",
    btn_ok: "យល់ព្រម",
    appDialogAlertTitle: "ការជូនដំណឹង",
    appDialogConfirmTitle: "សូមបញ្ជាក់",
    posCustomerMemo: "កំណត់ចំណាំអតិថិជន",
    posTable: "Table",
    posOrderGuestCount: "ចំនួនភ្ញៀវ",
    posKitchenFullCancelBanner: "Order fully cancelled — kitchen check",
    posKitchenPartialReprintBanner: "ធ្វើបច្ចុប្បន្នភាពបន្ទាប់ពីបោះបង់មួយផ្នែក (ការកម្មង់បច្ចុប្បន្ន)",
    posPrintCutFailedDetail: "ការបោះពុម្ពបានបញ្ចប់ ប៉ុន្តែការកាត់ក្រដាសដោយស្វ័យប្រវត្តិបរាជ័យ។{detail}",
    posPrintFailedWithReason: "បោះពុម្ពបរាជ័យ៖ {reason}",
    posPrintRequestError: "មានកំហុសពេលស្នើសុំបោះពុម្ព។",
    posKitchenOrder: "ស្លីបផ្ទះបាយ",
    posKitchen1: "ផ្ទះបាយ 1",
    posKitchen2: "ផ្ទះបាយ 2",
    posKitchen3: "ផ្ទះបាយ ៣",
    posOrderTypeDineIn: "ញ៉ាំនៅហាង",
    posOrderTypeTakeout: "យកត្រឡប់",
    posOrderTypeDelivery: "ដឹកជញ្ជូន",
    posMemberPortalOrder: "Member order",
    posMemberPortalOrderNotice: "This is a member order",
    posMemberPortalPaymentPending: "Payment pending",
    posPickupAtShort: "Pickup",
    posMember: "Member",
    posMemberNo: "Member no",
    posCoupon: "Coupon",
    posPointsShort: "Points",
  },
  vi: {
    cancel: "Hủy",
    btn_ok: "OK",
    appDialogAlertTitle: "Thông báo",
    appDialogConfirmTitle: "Xác nhận",
    posCustomerMemo: "Ghi chú khách hàng",
    posTable: "Bàn",
    posOrderGuestCount: "Số khách",
    posKitchenFullCancelBanner: "Order fully cancelled — kitchen check",
    posKitchenPartialReprintBanner: "Đã cập nhật sau khi hủy một phần (đơn hiện tại)",
    posPrintCutFailedDetail: "Đã in xong nhưng cắt giấy tự động thất bại.{detail}",
    posPrintFailedWithReason: "In thất bại: {reason}",
    posPrintRequestError: "Đã xảy ra lỗi khi gửi yêu cầu in.",
    posKitchenOrder: "Phiếu bếp",
    posKitchen1: "Bếp 1",
    posKitchen2: "Bếp 2",
    posKitchen3: "Bếp 3",
    posOrderTypeDineIn: "Ăn tại chỗ",
    posOrderTypeTakeout: "Mang đi",
    posOrderTypeDelivery: "Giao hàng",
    posMemberPortalOrder: "Member order",
    posMemberPortalOrderNotice: "This is a member order",
    posMemberPortalPaymentPending: "Payment pending",
    posPickupAtShort: "Pickup",
    posMember: "Member",
    posMemberNo: "Member no",
    posCoupon: "Coupon",
    posPointsShort: "Points",
  },
  ms: {
    cancel: "Batal",
    btn_ok: "OK",
    appDialogAlertTitle: "Notis",
    appDialogConfirmTitle: "Sahkan",
    posCustomerMemo: "Memo pelanggan",
    posTable: "Meja",
    posOrderGuestCount: "Bilangan tetamu",
    posKitchenFullCancelBanner: "Order fully cancelled — kitchen check",
    posKitchenPartialReprintBanner: "Dikemas kini selepas batal sebahagian (pesanan semasa)",
    posPrintCutFailedDetail: "Cetakan selesai, tetapi pemotongan kertas automatik gagal.{detail}",
    posPrintFailedWithReason: "Cetakan gagal: {reason}",
    posPrintRequestError: "Ralat berlaku semasa meminta cetakan.",
    posKitchenOrder: "Slip dapur",
    posKitchen1: "Dapur 1",
    posKitchen2: "Dapur 2",
    posKitchen3: "Dapur 3",
    posOrderTypeDineIn: "Makan di kedai",
    posOrderTypeTakeout: "Bungkus",
    posOrderTypeDelivery: "Penghantaran",
    posMemberPortalOrder: "Member order",
    posMemberPortalOrderNotice: "This is a member order",
    posMemberPortalPaymentPending: "Payment pending",
    posPickupAtShort: "Pickup",
    posMember: "Member",
    posMemberNo: "Member no",
    posCoupon: "Coupon",
    posPointsShort: "Points",
  },
}

function resolveRuntimeUiLang(lang: string): LangCode {
  return isLangCode(lang) ? lang : "ko"
}

function formatRuntimeUiString(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{${key}}`).join(String(value))
  }
  return result
}

export function getRuntimeUiString(
  lang: string,
  key: string,
  vars?: Record<string, string | number>
): string {
  const resolvedLang = resolveRuntimeUiLang(lang)
  const dict = RUNTIME_UI_STRINGS[resolvedLang] as Record<string, string>
  const fallback = RUNTIME_UI_STRINGS.en as Record<string, string>
  const template = dict[key] ?? fallback[key] ?? key
  return formatRuntimeUiString(template, vars)
}

export function getRuntimeDialogLabels(lang: string) {
  return {
    cancel: getRuntimeUiString(lang, "cancel"),
    ok: getRuntimeUiString(lang, "btn_ok"),
    alertTitle: getRuntimeUiString(lang, "appDialogAlertTitle"),
    confirmTitle: getRuntimeUiString(lang, "appDialogConfirmTitle"),
  }
}

export function getClientUiLang(): LangCode {
  if (typeof window === "undefined") return "ko"
  try {
    const stored = sessionStorage.getItem("cm_lang")
    if (stored && isLangCode(stored)) return stored
  } catch {}
  return "ko"
}
