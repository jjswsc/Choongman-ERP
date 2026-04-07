#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs")
const path = require("path")

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is required")
  process.exit(1)
}

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  return process.argv[i + 1] || fallback
}

const rootDir = path.resolve(process.cwd(), arg("source", "docs"))
const storeScope = arg("store", "All")
const roleScope = arg("role", "")
const sourceName = arg("sourceName", "docs")
const chunkSize = Math.max(400, Number(arg("chunkSize", "1500")))

function listFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      listFiles(p, out)
      continue
    }
    if (!/\.(md|txt|csv|json)$/i.test(ent.name)) continue
    out.push(p)
  }
  return out
}

function splitChunks(text, maxLen) {
  const normalized = String(text || "").replace(/\r\n/g, "\n")
  const chunks = []
  let idx = 0
  while (idx < normalized.length) {
    const next = normalized.slice(idx, idx + maxLen)
    chunks.push(next)
    idx += maxLen
  }
  return chunks
}

async function insertChunk(row) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/ai_knowledge_chunks`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`insert failed ${res.status}: ${text.slice(0, 300)}`)
  }
}

async function main() {
  const files = fs.existsSync(rootDir) ? listFiles(rootDir) : []
  if (!files.length) {
    console.log("No files found:", rootDir)
    return
  }
  let inserted = 0
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8")
    const parts = splitChunks(raw, chunkSize)
    for (let i = 0; i < parts.length; i += 1) {
      const title = `${path.basename(file)}#${i + 1}`
      await insertChunk({
        source: sourceName,
        title,
        content: parts[i],
        tags: [],
        store_scope: storeScope,
        role_scope: roleScope || null,
      })
      inserted += 1
    }
    console.log(`Indexed ${file} (${parts.length} chunks)`)
  }
  console.log(`Done. Inserted chunks: ${inserted}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

