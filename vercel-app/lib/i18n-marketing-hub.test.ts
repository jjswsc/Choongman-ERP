import { describe, expect, it } from "vitest"
import { I18N_MARKETING_HUB_EN, I18N_MARKETING_HUB_KO, I18N_MARKETING_HUB_TH } from "./i18n-marketing-hub"

describe("marketing hub i18n", () => {
  it("keeps ko/en/th keys aligned", () => {
    const ko = Object.keys(I18N_MARKETING_HUB_KO).sort()
    const en = Object.keys(I18N_MARKETING_HUB_EN).sort()
    const th = Object.keys(I18N_MARKETING_HUB_TH).sort()
    expect(en).toEqual(ko)
    expect(th).toEqual(ko)
  })
})
