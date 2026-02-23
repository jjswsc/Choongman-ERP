const XLSX = require('xlsx')
const path = require('path')

const p = path.join(process.env.USERPROFILE || '', 'Downloads', '매출 상세내역 (2).xlsx')
try {
  const wb = XLSX.readFile(p)
  const ws = wb.Sheets['Sheet1']
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const tableIdx = 4
  const paymentAmountIdx = 22 // 결제 금액 (매출액 산출 기준)
  const channelStats = {}
  let sample = 0
  for (let i = 1; i < data.length && sample < 10000; i++) {
    const channel = String(data[i][tableIdx] || '').trim()
    if (!channel) continue
    const sales = parseFloat(data[i][paymentAmountIdx]) || 0
    if (!channelStats[channel]) channelStats[channel] = { rows: 0, sales: 0 }
    channelStats[channel].rows++
    channelStats[channel].sales += sales
    sample++
  }
  console.log('=== 테이블(채널)별 분포 (배달앱 구분 가능) ===')
  Object.entries(channelStats)
    .sort((a, b) => b[1].sales - a[1].sales)
    .forEach(([k, v]) => console.log(k.padEnd(20), '| 행수:', v.rows, '| 매출:', Math.round(v.sales).toLocaleString()))
} catch (e) {
  console.error('Error:', e.message)
}
