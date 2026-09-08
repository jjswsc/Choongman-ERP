import { describe, expect, it } from "vitest"
import { joinPosI18nAllLangs } from "@/lib/pos-i18n-all-langs"

describe("joinPosI18nAllLangs", () => {
  it("stacks Thai, Korean, and English for business-open gate copy", () => {
    const body = joinPosI18nAllLangs("posBusinessOpenRequiredBody")
    expect(body).toContain("เปิดร้าน")
    expect(body).toContain("영업 시작")
    expect(body.toLowerCase()).toContain("business")
    expect(body).toContain("လုပ်ငန်း")
    expect(body).toContain("ທຸລະກິດ")
    expect(body).toContain("អាជីវកម្ម")
    expect(body).toContain("Mở ca")
    expect(body).toContain("Buka operasi")
    expect(body.indexOf("กรุณา")).toBeLessThan(body.indexOf("오늘 POS"))
  })

  it("returns fallback when the key is missing", () => {
    expect(joinPosI18nAllLangs("posKeyThatDoesNotExist", "fallback")).toBe("fallback")
  })
})
