// 매장 방문 통계용 데이터 타입 및 유틸리티
// 실제 운영 시 getStoreVisitStats/getStoreVisitHistory API와 연동

export type VisitRecord = {
  id: number
  employee: string
  department: string
  store: string
  purpose: string
  date: string
  durationMin: number
}

/** 샘플/폴백 데이터 (API 연동 전 또는 데이터 없을 때) */
export const visitRecordsSample: VisitRecord[] = [
  { id: 1, employee: "Ms. Jitta Namthon", department: "Director", store: "Ekkamai", purpose: "정기점검", date: "2026-01-05", durationMin: 95 },
  { id: 2, employee: "Ms. Jitta Namthon", department: "Director", store: "Asoke", purpose: "직원교육", date: "2026-01-07", durationMin: 120 },
  { id: 3, employee: "전성원", department: "기타", store: "True Digital Park", purpose: "정기점검", date: "2026-01-08", durationMin: 60 },
  { id: 4, employee: "Mr. Prawat Thosanguan", department: "기타", store: "Bangna", purpose: "매장미팅", date: "2026-01-09", durationMin: 45 },
  { id: 5, employee: "Ms. Jitta Namthon", department: "Director", store: "MBK", purpose: "긴급지원", date: "2026-01-10", durationMin: 180 },
  { id: 6, employee: "전성원", department: "기타", store: "Future Park", purpose: "정기점검", date: "2026-01-12", durationMin: 75 },
  { id: 7, employee: "Mr. Choi ju young", department: "기타", store: "Ekkamai", purpose: "직원교육", date: "2026-01-13", durationMin: 90 },
  { id: 8, employee: "นางสาว ณฐนนท ยุ่นแก้ว", department: "기타", store: "Union Mall", purpose: "정기점검", date: "2026-01-14", durationMin: 55 },
  { id: 9, employee: "Ms. Jitta Namthon", department: "Director", store: "Puket", purpose: "매장미팅", date: "2026-01-15", durationMin: 300 },
  { id: 10, employee: "전성원", department: "기타", store: "Asoke", purpose: "긴급지원", date: "2026-01-17", durationMin: 40 },
  { id: 11, employee: "Mr. Prawat Thosanguan", department: "기타", store: "True Digital Park", purpose: "정기점검", date: "2026-01-18", durationMin: 70 },
  { id: 12, employee: "Mr. Choi ju young", department: "기타", store: "Office", purpose: "매장미팅", date: "2026-01-20", durationMin: 50 },
  { id: 13, employee: "Ms. Jitta Namthon", department: "Director", store: "Bangna", purpose: "직원교육", date: "2026-01-22", durationMin: 110 },
  { id: 14, employee: "นางสาว ณฐนนท ยุ่นแก้ว", department: "기타", store: "Ekkamai", purpose: "정기점검", date: "2026-01-23", durationMin: 65 },
  { id: 15, employee: "전성원", department: "기타", store: "MBK", purpose: "정기점검", date: "2026-01-25", durationMin: 85 },
  { id: 16, employee: "Ms. Jitta Namthon", department: "Director", store: "Future Park", purpose: "정기점검", date: "2026-01-27", durationMin: 90 },
  { id: 17, employee: "Mr. Prawat Thosanguan", department: "기타", store: "Asoke", purpose: "직원교육", date: "2026-01-28", durationMin: 100 },
  { id: 18, employee: "Mr. Choi ju young", department: "기타", store: "Bangna", purpose: "긴급지원", date: "2026-01-30", durationMin: 35 },
  { id: 19, employee: "Ms. Jitta Namthon", department: "Director", store: "True Digital Park", purpose: "매장미팅", date: "2026-02-01", durationMin: 80 },
  { id: 20, employee: "전성원", department: "기타", store: "Union Mall", purpose: "정기점검", date: "2026-02-03", durationMin: 60 },
  { id: 21, employee: "นางสาว ณฐนนท ยุ่นแก้ว", department: "기타", store: "Puket", purpose: "직원교육", date: "2026-02-04", durationMin: 150 },
  { id: 22, employee: "Ms. Jitta Namthon", department: "Director", store: "MBK", purpose: "정기점검", date: "2026-02-05", durationMin: 70 },
  { id: 23, employee: "Mr. Prawat Thosanguan", department: "기타", store: "Office", purpose: "정기점검", date: "2026-02-07", durationMin: 55 },
  { id: 24, employee: "전성원", department: "기타", store: "Ekkamai", purpose: "매장미팅", date: "2026-02-08", durationMin: 45 },
  { id: 25, employee: "Mr. Choi ju young", department: "기타", store: "Asoke", purpose: "정기점검", date: "2026-02-10", durationMin: 80 },
  { id: 26, employee: "Ms. Jitta Namthon", department: "Director", store: "Bangna", purpose: "긴급지원", date: "2026-02-11", durationMin: 200 },
  { id: 27, employee: "นางสาว ณฐนนท ยุ่นแก้ว", department: "기타", store: "True Digital Park", purpose: "직원교육", date: "2026-02-12", durationMin: 90 },
  { id: 28, employee: "Mr. Prawat Thosanguan", department: "기타", store: "Future Park", purpose: "매장미팅", date: "2026-02-13", durationMin: 65 },
  { id: 29, employee: "전성원", department: "기타", store: "MBK", purpose: "긴급지원", date: "2026-02-14", durationMin: 30 },
  { id: 30, employee: "Ms. Jitta Namthon", department: "Director", store: "Ekkamai", purpose: "정기점검", date: "2026-02-15", durationMin: 105 },
]

/** V0 호환용 (visitRecords) */
export const visitRecords = visitRecordsSample

export function formatMinutes(min: number): string {
  if (min < 60) return `${min}분`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`
}

export function aggregateBy<T extends string>(
  records: VisitRecord[],
  key: keyof VisitRecord
): { name: string; totalMin: number; visits: number }[] {
  const map = new Map<string, { totalMin: number; visits: number }>()
  records.forEach((r) => {
    const k = r[key] as string
    const prev = map.get(k) || { totalMin: 0, visits: 0 }
    map.set(k, { totalMin: prev.totalMin + r.durationMin, visits: prev.visits + 1 })
  })
  return Array.from(map.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalMin - a.totalMin)
}

export function getWeeklyTrend(records: VisitRecord[]): { week: string; totalMin: number; visits: number }[] {
  const map = new Map<string, { totalMin: number; visits: number }>()
  records.forEach((r) => {
    const d = new Date(r.date)
    const startOfWeek = new Date(d)
    startOfWeek.setDate(d.getDate() - d.getDay())
    const key = `${(startOfWeek.getMonth() + 1).toString().padStart(2, "0")}/${startOfWeek.getDate().toString().padStart(2, "0")}`
    const prev = map.get(key) || { totalMin: 0, visits: 0 }
    map.set(key, { totalMin: prev.totalMin + r.durationMin, visits: prev.visits + 1 })
  })
  return Array.from(map.entries())
    .map(([week, data]) => ({ week, ...data }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

export function getStorePurposeMatrix(records: VisitRecord[]): {
  stores: string[]
  purposes: string[]
  matrix: number[][]
} {
  const stores = [...new Set(records.map((r) => r.store))].sort()
  const purposes = [...new Set(records.map((r) => r.purpose))].sort()
  const matrix = stores.map((store) =>
    purposes.map((purpose) =>
      records
        .filter((r) => r.store === store && r.purpose === purpose)
        .reduce((sum, r) => sum + r.durationMin, 0)
    )
  )
  return { stores, purposes, matrix }
}
