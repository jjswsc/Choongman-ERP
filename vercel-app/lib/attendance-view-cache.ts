import { createErpQueryViewCache } from "@/lib/erp-query-view-cache"

export type AttendanceViewCache = {
  startDate: string
  endDate: string
  storeFilter: string
  employeeFilter: string
  statusFilter: string
  attTab: string
  list: unknown[]
  hasSearched: boolean
}

export const attendanceViewCache = createErpQueryViewCache<AttendanceViewCache>()
