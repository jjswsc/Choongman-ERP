/**
 * 신고 범위 탭 — 태국 회계·세무 일정 요약(참고용).
 * 실제 기한은 법 개정·RD/DBD 공지·회계연도·납세자 유형에 따라 달라질 수 있음.
 */

export const THAI_FILING_SCHEDULE_SECTIONS: { titleKey: string; bodyKey: string }[] = [
  { titleKey: "accCompSched_sec1_title", bodyKey: "accCompSched_sec1_body" },
  { titleKey: "accCompSched_sec2_title", bodyKey: "accCompSched_sec2_body" },
  { titleKey: "accCompSched_sec3_title", bodyKey: "accCompSched_sec3_body" },
  { titleKey: "accCompSched_sec4_title", bodyKey: "accCompSched_sec4_body" },
  { titleKey: "accCompSched_sec5_title", bodyKey: "accCompSched_sec5_body" },
  { titleKey: "accCompSched_sec6_title", bodyKey: "accCompSched_sec6_body" },
]

export const THAI_FILING_SCHEDULE_TABLE_ROWS: [string, string, string][] = [
  ["accCompSched_tbl_vat_item", "accCompSched_tbl_vat_period", "accCompSched_tbl_vat_deadline"],
  ["accCompSched_tbl_wht_item", "accCompSched_tbl_wht_period", "accCompSched_tbl_wht_deadline"],
  ["accCompSched_tbl_p51_item", "accCompSched_tbl_p51_period", "accCompSched_tbl_p51_deadline"],
  ["accCompSched_tbl_p50_item", "accCompSched_tbl_p50_period", "accCompSched_tbl_p50_deadline"],
  ["accCompSched_tbl_dbd_item", "accCompSched_tbl_dbd_period", "accCompSched_tbl_dbd_deadline"],
  ["accCompSched_tbl_agm_item", "accCompSched_tbl_agm_period", "accCompSched_tbl_agm_deadline"],
]
