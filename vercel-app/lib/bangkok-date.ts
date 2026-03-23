/** 방콕(Asia/Bangkok) 기준 달력 날짜 yyyy-MM-dd */
export function bangkokDateStrISO(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}
