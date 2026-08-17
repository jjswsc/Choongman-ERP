import { describe, expect, it } from "vitest"
import {
  countSupabasePasteStatements,
  isSingleSupabasePaste,
} from "@/lib/sql-supabase-paste-policy"

describe("SQL Supabase paste — 한 번 실행 = 한 블록", () => {
  it("한 SELECT는 붙여넣기 1회", () => {
    const sql = `
-- ① APO89
SELECT id, store_name FROM public.receivable_transactions WHERE invoice_no = 'APO20260511-89'
`
    expect(isSingleSupabasePaste(sql)).toBe(true)
    expect(countSupabasePasteStatements(sql)).toBe(1)
  })

  it("두 SELECT를 한 붙여넣기에 넣으면 안 됨", () => {
    const sql = `
SELECT 1;
SELECT 2;
`
    expect(isSingleSupabasePaste(sql)).toBe(false)
    expect(countSupabasePasteStatements(sql)).toBe(2)
  })

  it("미리보기 SELECT와 DELETE를 같은 붙여넣기에 넣으면 안 됨", () => {
    const sql = `
SELECT id FROM public.receivable_transactions WHERE id IN (2217);
DELETE FROM public.receivable_transactions WHERE id IN (2217);
`
    expect(isSingleSupabasePaste(sql)).toBe(false)
  })
})
