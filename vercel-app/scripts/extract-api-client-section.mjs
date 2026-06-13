import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const apiClientPath = path.join(root, "lib", "api-client.ts")

const startMarker = process.argv[2]
const endMarker = process.argv[3]
const outName = process.argv[4]
const importBlock = process.argv[5] || ""

if (!startMarker || !endMarker || !outName) {
  console.error("Usage: node extract-api-client-section.mjs <startMarker> <endMarker> <outFile> [importBlock]")
  process.exit(1)
}

const lines = fs.readFileSync(apiClientPath, "utf8").split(/\r?\n/)
const start = lines.findIndex((l) => l.includes(startMarker))
const end = lines.findIndex((l) => l.includes(endMarker))
if (start < 0 || end < 0 || end <= start) {
  console.error("markers not found or invalid:", { start, end })
  process.exit(1)
}

const body = lines.slice(start + 1, end).join("\n")
const header = `/**
 * (${outName}) — api-client.ts에서 분리 — move only
 */
${importBlock}

`
const outPath = path.join(root, "lib", "api-client", outName)
fs.writeFileSync(outPath, header + body)

const kept = [...lines.slice(0, start), ...lines.slice(end)]
fs.writeFileSync(apiClientPath, kept.join("\n"))
console.log(`Wrote ${outPath} (${body.split("\n").length} lines), removed from api-client.ts`)
