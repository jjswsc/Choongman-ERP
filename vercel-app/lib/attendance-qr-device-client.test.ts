import { describe, expect, it } from "vitest"
import {
  ATTENDANCE_QR_KIOSK_PATH,
  attendanceQrKioskLoginHref,
  safeAttendanceQrKioskRedirect,
} from "@/lib/attendance-qr-device-client"

describe("safeAttendanceQrKioskRedirect", () => {
  it("allows only the attendance QR kiosk path", () => {
    expect(safeAttendanceQrKioskRedirect("/kiosk/attendance-qr")).toBe(ATTENDANCE_QR_KIOSK_PATH)
    expect(safeAttendanceQrKioskRedirect("/pos")).toBe("")
    expect(safeAttendanceQrKioskRedirect("https://evil.example/")).toBe("")
    expect(safeAttendanceQrKioskRedirect("/kiosk/attendance-qr?x=1")).toBe("")
  })

  it("builds POS login href that returns to the kiosk", () => {
    expect(attendanceQrKioskLoginHref()).toBe(
      `/pos/login?redirect=${encodeURIComponent(ATTENDANCE_QR_KIOSK_PATH)}`
    )
  })
})
