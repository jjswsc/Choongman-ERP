import { describe, expect, it } from "vitest"
import {
  SESSION_EXPIRED_I18N_KEY,
  loginNoticeKeyFromQueryMsg,
  loginPathWithSessionExpired,
} from "@/lib/session-expired-notice"

describe("session expired notice", () => {
  it("query msg maps to i18n keys", () => {
    expect(loginNoticeKeyFromQueryMsg("session_expired")).toBe(SESSION_EXPIRED_I18N_KEY)
    expect(loginNoticeKeyFromQueryMsg("no_admin")).toBe("msg_no_admin_permission")
    expect(loginNoticeKeyFromQueryMsg("")).toBeUndefined()
  })

  it("login path keeps other query and sets msg", () => {
    expect(loginPathWithSessionExpired("/login")).toBe("/login?msg=session_expired")
    expect(loginPathWithSessionExpired("/admin/login?redirect=/admin")).toBe(
      "/admin/login?redirect=%2Fadmin&msg=session_expired"
    )
  })
})
