import { describe, expect, it } from "vitest"
import {
  isStoreActionAudienceBroadcast,
  listStoreActionAudienceEmployees,
  storeActionAudienceFromPayload,
} from "@/lib/store-action-audience"

describe("store-action-audience", () => {
  it("treats empty/all as no broadcast", () => {
    expect(isStoreActionAudienceBroadcast(storeActionAudienceFromPayload({
      targetStore: "전체",
      targetRole: "전체",
      targetPermissionGroup: "",
    }))).toBe(false)
    expect(
      isStoreActionAudienceBroadcast({
        targetStore: "",
        targetRole: "",
        targetPermissionGroup: "",
        targetRecipients: "",
      })
    ).toBe(false)
  })

  it("broadcasts when store or job selected", () => {
    const fields = storeActionAudienceFromPayload({
      targetStore: "CM Silom",
      targetRole: "Service",
      targetPermissionGroup: "",
    })
    expect(isStoreActionAudienceBroadcast(fields)).toBe(true)
    const emps = listStoreActionAudienceEmployees(
      [
        {
          id: 1,
          store: "CM Silom",
          name: "A",
          job: "Service",
          role: "staff",
          resignDate: "",
        },
        {
          id: 2,
          store: "CM Silom",
          name: "B",
          job: "Kitchen",
          role: "staff",
          resignDate: "",
        },
        {
          id: 3,
          store: "Other",
          name: "C",
          job: "Service",
          role: "staff",
          resignDate: "",
        },
      ],
      fields
    )
    expect(emps.map((e) => e.id)).toEqual([1])
  })

  it("uses explicit recipients when set", () => {
    const fields = storeActionAudienceFromPayload({
      targetStore: "전체",
      targetRole: "전체",
      targetPermissionGroup: "",
      targetRecipients: [{ store: "CM Silom", name: "Somchai" }],
    })
    expect(isStoreActionAudienceBroadcast(fields)).toBe(true)
    const emps = listStoreActionAudienceEmployees(
      [
        {
          id: 7,
          store: "CM Silom",
          name: "Somchai",
          job: "Service",
          role: "staff",
          resignDate: "",
        },
        {
          id: 8,
          store: "CM Silom",
          name: "Other",
          job: "Service",
          role: "staff",
          resignDate: "",
        },
      ],
      fields
    )
    expect(emps.map((e) => e.id)).toEqual([7])
  })
})
