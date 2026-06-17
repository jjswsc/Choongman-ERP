// ข้อมูลจำลองสำหรับแอประบบสมาชิก Choongman Chicken (mock data)

export type Tier = "DIAMOND" | "PLATINUM" | "GOLD" | "SILVER"

export const member = {
  name: "ประวัติ",
  greeting: "สวัสดีครับ",
  tier: "DIAMOND" as Tier,
  phone: "098 •••• 3544",
  memberNo: "M007359",
  points: 640,
  currentPoints: 2140,
  nextTierPoints: 3000,
  nextTier: "PLATINUM" as Tier,
  pointsToNextTier: 860,
}

export const progressPercent = Math.round(
  (member.currentPoints / member.nextTierPoints) * 100,
)

export const quickActions = [
  { id: "order", icon: "UtensilsCrossed", label: "Order", sub: "สั่งอาหาร" },
  { id: "delivery", icon: "ShoppingCart", label: "Delivery", sub: "เดลิเวอรี่" },
  { id: "privilege", icon: "Gift", label: "สิทธิพิเศษ", sub: "Coupons" },
  { id: "coupon", icon: "TicketPercent", label: "คูปองของฉัน", sub: "Coupons" },
  { id: "more", icon: "MoreHorizontal", label: "More", sub: "" },
]

export const benefits = [
  {
    id: "triple",
    icon: "Percent",
    title: "รับคะแนน 3 เท่า",
    desc: "ทุก 25 บาท รับ 3 คะแนน",
  },
  {
    id: "birthday",
    icon: "Cake",
    title: "ส่วนลดวันเกิด 20%",
    desc: "เฉพาะเดือนเกิดของคุณ",
  },
  {
    id: "member",
    icon: "Crown",
    title: "สิทธิพิเศษเฉพาะสมาชิก",
    desc: "โปรโมชั่นเฉพาะคุณเท่านั้น",
  },
  {
    id: "priority",
    icon: "Sparkles",
    title: "บริการพิเศษ",
    desc: "Priority service ที่สาขา",
  },
]

export const tiers: {
  id: Tier
  label: string
  color: string
}[] = [
  { id: "DIAMOND", label: "DIAMOND", color: "#5b8fb9" },
  { id: "PLATINUM", label: "PLATINUM", color: "#9aa5b1" },
  { id: "GOLD", label: "GOLD", color: "#d9a521" },
  { id: "SILVER", label: "SILVER", color: "#b6c0cc" },
]

export const promos = [
  {
    id: 1,
    title: "โปรโมชั่น 111 สุดคุ้ม",
    sub: "ไก่กรอม 8 ชิ้น เพียง",
    price: "111.-",
    image: "/images/promo-chicken.png",
  },
]

export const stamp = {
  current: 7,
  total: 10,
  reward: "ไก่กรอบ 1 ชิ้น",
}

export type RewardCategory = "all" | "food" | "drink" | "souvenir"

export const rewardCategories: { id: RewardCategory; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "food", label: "อาหาร" },
  { id: "drink", label: "เครื่องดื่ม" },
  { id: "souvenir", label: "ของที่ระลึก" },
]

export const rewards = [
  {
    id: 1,
    name: "ไก่กรอบ 1 ชิ้น",
    points: 250,
    image: "/images/fried-chicken-plate.png",
    category: "food" as RewardCategory,
  },
  {
    id: 2,
    name: "นักเก็ต 6 ชิ้น",
    points: 300,
    image: "/images/nuggets.png",
    category: "food" as RewardCategory,
  },
  {
    id: 3,
    name: "โค้ก (รีฟิล)",
    points: 150,
    image: "/images/cola.png",
    category: "drink" as RewardCategory,
  },
  {
    id: 4,
    name: "ส่วนลด 50 บาท",
    points: 500,
    image: null,
    discount: "50฿",
    category: "souvenir" as RewardCategory,
  },
]

export type HistoryType = "earn" | "redeem" | "bonus"
export type HistoryFilter = "all" | "points" | "reward" | "coupon"

export const historyFilters: { id: HistoryFilter; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "points", label: "คะแนน" },
  { id: "reward", label: "รางวัล" },
  { id: "coupon", label: "คูปอง" },
]

export const history: {
  id: number
  type: HistoryType
  title: string
  desc: string
  date: string
  amount: number
}[] = [
  {
    id: 1,
    type: "earn",
    title: "ได้รับคะแนน",
    desc: "สั่งอาหาร #OD24060123",
    date: "1 มิ.ย. 2567",
    amount: 128,
  },
  {
    id: 2,
    type: "redeem",
    title: "แลกรางวัล",
    desc: "ไก่กรอบ 1 ชิ้น",
    date: "30 พ.ค. 2567",
    amount: -250,
  },
  {
    id: 3,
    type: "bonus",
    title: "ได้รับคะแนน (พิเศษ)",
    desc: "คะแนน 3 เท่า",
    date: "30 พ.ค. 2567",
    amount: 96,
  },
  {
    id: 4,
    type: "earn",
    title: "ได้รับคะแนน",
    desc: "สั่งอาหาร #OD24052087",
    date: "22 พ.ค. 2567",
    amount: 64,
  },
  {
    id: 5,
    type: "redeem",
    title: "แลกรางวัล",
    desc: "โค้ก (รีฟิล)",
    date: "18 พ.ค. 2567",
    amount: -150,
  },
]
