import type { Metadata, Viewport } from "next"
import { AttendanceQrKiosk } from "@/components/kiosk/attendance-qr-kiosk"

export const metadata: Metadata = {
  title: "출퇴근 QR",
  description: "매장 출퇴근 QR 표시 키오스크",
}

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

/** 출퇴근 QR 전용 키오스크 — POS 레이아웃·로그인 게이트 없음 */
export default function AttendanceQrKioskPage() {
  return <AttendanceQrKiosk />
}
