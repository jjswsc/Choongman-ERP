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

  it("builds POS login href that returns to the kiosk and forces account switch", () => {
    expect(attendanceQrKioskLoginHref()).toBe(
      `/pos/login?redirect=${encodeURIComponent(ATTENDANCE_QR_KIOSK_PATH)}&switch=1`
    )
  })

  it("prefills store on POS login when the kiosk already picked one", () => {
    const href = attendanceQrKioskLoginHref("CM Huamak")
    expect(href.startsWith("/pos/login?")).toBe(true)
    const q = new URL(href, "https://example.local").searchParams
    expect(q.get("redirect")).toBe(ATTENDANCE_QR_KIOSK_PATH)
    expect(q.get("switch")).toBe("1")
    expect(q.get("store")).toBe("CM Huamak")
  })
})
