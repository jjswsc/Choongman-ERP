import { describe, expect, it } from "vitest"
import { isMissingPriceSchedulesTableError } from "@/lib/price-schedule"

describe("isMissingPriceSchedulesTableError", () => {
  it("treats PostgREST PGRST205 schema cache miss as missing table", () => {
    expect(
      isMissingPriceSchedulesTableError(
        'Supabase select failed: {"code":"PGRST205","message":"Could not find the table \'public.price_schedules\' in the schema cache"}'
      )
    ).toBe(true)
  })

  it("treats postgres 42P01 as missing table", () => {
    expect(
      isMissingPriceSchedulesTableError(
        'Supabase select failed: {"code":"42P01","message":"relation \\"price_schedules\\" does not exist"}'
      )
    ).toBe(true)
  })

  it("does not treat unrelated errors as missing table", () => {
    expect(isMissingPriceSchedulesTableError("JWT expired")).toBe(false)
    expect(isMissingPriceSchedulesTableError("Supabase request timeout")).toBe(false)
  })
})
