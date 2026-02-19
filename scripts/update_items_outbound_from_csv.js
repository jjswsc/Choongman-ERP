/**
 * CSV 파일에서 품목 출고지 일괄 업데이트용 SQL 생성
 * 
 * 사용법:
 *   node scripts/update_items_outbound_from_csv.js "경로/to/items_rows(2).csv"
 * 또는 CSV를 프로젝트 scripts 폴더에 두고:
 *   node scripts/update_items_outbound_from_csv.js
 * 
 * 출력: supabase에 실행할 SQL (UPDATE 문들)
 */

const fs = require('fs');
const path = require('path');

const defaultCsvPath = path.join(__dirname, 'items_outbound.csv');
const csvPath = process.argv[2] || defaultCsvPath;

if (!fs.existsSync(csvPath)) {
  console.error('CSV 파일을 찾을 수 없습니다:', csvPath);
  console.error('사용법: node update_items_outbound_from_csv.js [CSV경로]');
  process.exit(1);
}

const csv = fs.readFileSync(csvPath, 'utf-8');
const lines = csv.split(/\r?\n/).filter(Boolean);
if (lines.length < 2) {
  console.error('CSV에 헤더 외 데이터가 없습니다.');
  process.exit(1);
}

// 헤더: id,code,category,???,name,spec,... → 컬럼 3 (인덱스 3) = 출고지
const header = lines[0].split(',');
const rows = lines.slice(1);

const updates = [];
for (const line of rows) {
  // 쉼표 안에 따옴표가 있을 수 있으므로 간단 파싱
  const parts = parseCsvLine(line);
  if (parts.length < 4) continue;
  const code = (parts[1] || '').trim();
  const outbound = (parts[3] || '').trim(); // D열 (인덱스 3) = 출고지
  if (!code || !outbound) continue;
  // SQL 이스케이프
  const codeEsc = code.replace(/'/g, "''");
  const outEsc = outbound.replace(/'/g, "''");
  updates.push(`UPDATE items SET outbound_location = '${outEsc}' WHERE code = '${codeEsc}';`);
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === ',') {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

console.log('-- ============================================================');
console.log('-- 품목 출고지 일괄 업데이트 (CSV 기반)');
console.log('-- 생성일:', new Date().toISOString().slice(0, 10));
console.log('-- 사용법: Supabase SQL Editor에 붙여넣기 후 Run');
console.log('-- ============================================================\n');

const sql = updates.join('\n');
const outPath = path.join(__dirname, 'items_outbound_location_updates.sql');
fs.writeFileSync(outPath, [
  '-- ============================================================',
  '-- 품목 출고지 일괄 업데이트 (CSV 기반)',
  '-- 생성일: ' + new Date().toISOString().slice(0, 10),
  '-- 사용법: Supabase SQL Editor에 붙여넣기 후 Run',
  '-- ============================================================\n',
  sql,
  '',
  '-- 총 ' + updates.length + ' 건 업데이트'
].join('\n'), 'utf-8');

console.log('생성 완료:', outPath);
console.log('총', updates.length, '건 업데이트');
