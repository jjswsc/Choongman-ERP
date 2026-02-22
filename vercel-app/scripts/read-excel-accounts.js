/**
 * Excel Income Statement에서 계정과목 추출
 * 실행: node scripts/read-excel-accounts.js
 */
const XLSX = require('xlsx');
const path = require('path');

let excelPath = process.argv[2];
if (!excelPath) {
  try {
    const jsonPath = path.join(__dirname, 'excel-path.json');
    const cfg = require(jsonPath);
    excelPath = cfg.path;
  } catch (_) {}
}
if (!excelPath) {
  excelPath = path.join(process.env.USERPROFILE || '', 'OneDrive', 'Desktop', '회계', 'Ekkamai', '3. Income Statement - EKKAMAI - Sep. 2025.xlsx');
}

try {
  const workbook = XLSX.readFile(excelPath);
  const sheetNames = workbook.SheetNames;
  const firstSheet = workbook.Sheets[sheetNames[0]];
  const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  
  const accounts = [];
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < Math.min(3, row.length); c++) {
      const val = row[c];
      if (val == null || val === '') continue;
      const label = String(val).trim().replace(/^\|\s*/, '');
      if (label.length < 2) continue;
      if (/^[\d\s.,%]+$/.test(label)) continue;
      if (/^구\s*분$/.test(label) || label === 'TOTAL' || label === '12M' || label === '7M' || label === '8M' || label === '9M') continue;
      if (label.startsWith('(Scale') || label === '적요(THB,%)') continue;
      accounts.push({ row: r + 1, col: c, label });
      break;
    }
  }
  
  console.log('=== Excel 계정과목 (계층/라벨) ===');
  accounts.forEach(a => console.log(`R${a.row}: ${a.label}`));
  console.log('\n=== 계정과목만 (비숫자, 요약용) ===');
  const labels = [...new Set(accounts.map(a => a.label))];
  labels.forEach(l => console.log(l));
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
