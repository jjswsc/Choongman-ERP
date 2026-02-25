const XLSX = require("xlsx");
const { writeFileSync } = require("fs");
const { join } = require("path");

const base = join(__dirname, "..");
const xlsxPath = join(base, "원가분석.xlsx");
const outPath = join(base, "cost_excel_structure.txt");

let wb;
try {
  wb = XLSX.readFile(xlsxPath);
} catch (e) {
  writeFileSync(outPath, "ERROR: " + e.message, "utf8");
  process.exit(1);
}
let out = "=== Excel Structure ===\n\n";

for (const sheetName of wb.SheetNames) {
  out += "\n=== Sheet: " + sheetName + " ===\n";
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  for (let i = 0; i < Math.min(50, data.length); i++) {
    out += JSON.stringify(data[i]) + "\n";
  }
  if (data.length > 50) out += "... (more rows)\n";
}

writeFileSync(outPath, out, "utf8");
console.log("Written to", outPath);
