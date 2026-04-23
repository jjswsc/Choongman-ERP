import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const line = 'import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"\n'

function walk(d, out) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) {
      if (f.name === "node_modules") continue
      walk(p, out)
    } else if (f.name.endsWith(".tsx")) {
      let s = fs.readFileSync(p, "utf8")
      if (s.includes("<AdminTabsBarWithHelp") && !s.includes("admin-tabs-bar-with-help")) out.push(p)
    }
  }
}

const files = []
walk(path.join(root, "app"), files)
walk(path.join(root, "components"), files)

for (const p of files) {
  let s = fs.readFileSync(p, "utf8")
  const i = s.indexOf('"use client"')
  const j = s.indexOf("'use client'")
  let ins = 0
  if (i >= 0) ins = i + '"use client"'.length
  else if (j >= 0) ins = j + "'use client'".length
  else {
    console.warn("no use client", p)
    continue
  }
  while (ins < s.length && (s[ins] === "\r" || s[ins] === "\n")) ins++
  s = s.slice(0, ins) + "\n" + line + s.slice(ins)
  fs.writeFileSync(p, s)
  console.log("fixed", path.relative(root, p))
}
