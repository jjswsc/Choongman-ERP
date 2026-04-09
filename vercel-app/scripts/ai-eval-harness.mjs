import fs from "node:fs/promises"
import path from "node:path"

const ROOT = process.cwd()
const DEFAULT_CASES = path.join(ROOT, "scripts", "ai-eval-cases.json")
const OPENAI_MODEL = process.env.OPENAI_ERP_AI_MODEL?.trim() || "gpt-4o-mini"

function parseArgs(argv) {
  const out = {
    casesPath: DEFAULT_CASES,
    failOnMissingKey: false,
    temperature: 0.2,
    maxTokens: 700,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === "--cases" && argv[i + 1]) {
      out.casesPath = path.resolve(ROOT, argv[i + 1])
      i += 1
      continue
    }
    if (a === "--fail-on-missing-key") {
      out.failOnMissingKey = true
      continue
    }
    if (a === "--temperature" && argv[i + 1]) {
      out.temperature = Number(argv[i + 1]) || out.temperature
      i += 1
      continue
    }
    if (a === "--max-tokens" && argv[i + 1]) {
      out.maxTokens = Number(argv[i + 1]) || out.maxTokens
      i += 1
    }
  }
  return out
}

function validateCase(one) {
  if (!one || typeof one !== "object") throw new Error("Case must be an object")
  if (!one.id || !one.query) throw new Error("Case requires id and query")
  if (one.mustInclude && !Array.isArray(one.mustInclude)) throw new Error(`${one.id}: mustInclude must be array`)
  if (one.mustNotInclude && !Array.isArray(one.mustNotInclude)) throw new Error(`${one.id}: mustNotInclude must be array`)
}

function evaluateText(text, one) {
  const checks = []
  const mustInclude = one.mustInclude || []
  const mustNotInclude = one.mustNotInclude || []
  const minLength = Number(one.minLength || 0)

  for (const re of mustInclude) {
    const ok = new RegExp(re, "i").test(text)
    checks.push({ type: "mustInclude", pattern: re, ok })
  }
  for (const re of mustNotInclude) {
    const ok = !new RegExp(re, "i").test(text)
    checks.push({ type: "mustNotInclude", pattern: re, ok })
  }
  if (minLength > 0) {
    checks.push({ type: "minLength", pattern: String(minLength), ok: text.length >= minLength })
  }

  const pass = checks.every((c) => c.ok)
  return { pass, checks }
}

async function runOpenAi(messages, { temperature, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return { skipped: true, reason: "OPENAI_API_KEY missing" }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature,
      max_tokens: maxTokens,
      messages,
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${text.slice(0, 300)}`)
  }
  const json = JSON.parse(text)
  return {
    skipped: false,
    model: json.model || OPENAI_MODEL,
    text: json.choices?.[0]?.message?.content?.trim() || "",
  }
}

function buildMessages(query) {
  const systemPrompt =
    "You are the ERP AI center assistant. Respond in Korean only. " +
    "If evidence is missing, clearly say what is missing. " +
    "Do not invent exact numbers."
  const userPrompt =
    `질문: ${query}\n\n` +
    "출력 형식:\n" +
    "[판단]\n" +
    "- 1~2문장\n\n" +
    "[근거]\n" +
    "- 현재 답변의 근거/제약\n\n" +
    "[실행]\n" +
    "- 바로 실행할 항목 3개"
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]
}

async function main() {
  const args = parseArgs(process.argv)
  const raw = await fs.readFile(args.casesPath, "utf8")
  const cases = JSON.parse(raw)
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("No eval cases found")
  }
  for (const one of cases) validateCase(one)

  if (!process.env.OPENAI_API_KEY?.trim()) {
    const message = "OPENAI_API_KEY가 없어 AI 하네스를 스킵합니다."
    if (args.failOnMissingKey) {
      console.error(`❌ ${message}`)
      process.exit(1)
    }
    console.log(`⚠️ ${message}`)
    console.log("필요 시: node scripts/ai-eval-harness.mjs --fail-on-missing-key")
    return
  }

  const results = []
  let modelUsed = OPENAI_MODEL
  for (const one of cases) {
    const started = Date.now()
    const r = await runOpenAi(buildMessages(one.query), args)
    if (r.skipped) {
      console.log(`⚠️ ${one.id}: skipped (${r.reason})`)
      continue
    }
    modelUsed = r.model || modelUsed
    const ev = evaluateText(r.text || "", one)
    results.push({
      id: one.id,
      pass: ev.pass,
      elapsedMs: Date.now() - started,
      checks: ev.checks,
      response: r.text || "",
    })
  }

  const total = results.length
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)

  console.log(`\nAI Harness Result (${modelUsed})`)
  console.log(`- total: ${total}`)
  console.log(`- passed: ${passed}`)
  console.log(`- failed: ${failed.length}`)

  for (const row of results) {
    const icon = row.pass ? "✅" : "❌"
    console.log(`\n${icon} ${row.id} (${row.elapsedMs}ms)`)
    for (const c of row.checks) {
      console.log(`  - ${c.ok ? "ok" : "fail"} ${c.type}: ${c.pattern}`)
    }
  }

  if (failed.length > 0) {
    console.error("\n실패 케이스 응답 미리보기:")
    for (const row of failed) {
      console.error(`\n[${row.id}]`)
      console.error(row.response.slice(0, 500))
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("ai-eval-harness failed:", err)
  process.exit(1)
})
