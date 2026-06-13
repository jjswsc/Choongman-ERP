/** 견적서·PDF 텍스트에서 총액 후보 추출 (휴리스틱) */

const TOTAL_KEYWORDS =
  /total|grand\s*total|amount\s*due|net\s*amount|subtotal|sum|รวม|ยอดรวม|ทั้งหมด|สุทธิ|ราคารวม|รวมทั้งสิ้น|รวมเป็นเงิน|total\s*amount/i

export type ParsedQuoteAmount = {
  amount: number
  label: string
  confidence: "high" | "medium" | "low"
  method: "keyword" | "max" | "vision"
}

function parseNumbersFromFragment(fragment: string): number[] {
  const cleaned = fragment
    .replace(/฿|THB|บาท|Baht|USD|\$/gi, " ")
    .replace(/,/g, "")
  const matches = cleaned.match(/\d+(?:\.\d{1,2})?/g) || []
  return matches
    .map((m) => Number(m))
    .filter((n) => Number.isFinite(n) && n >= 100 && n < 500_000_000)
}

/** PDF 바이너리에서 텍스트 스트림 대략 추출 */
export function extractRoughPdfText(buffer: ArrayBuffer): string {
  const raw = new TextDecoder("latin1").decode(buffer)
  const parts: string[] = []
  const re = /\((?:\\.|[^\\)])*?\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const s = m[0]
      .slice(1, -1)
      .replace(/\\([nrt()\\])/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (s.length >= 2 && /[\dA-Za-zก-๙]/.test(s)) parts.push(s)
  }
  return parts.join("\n")
}

export function parseQuoteAmountFromText(text: string): ParsedQuoteAmount | null {
  const normalized = String(text || "").replace(/\u00a0/g, " ")
  if (!normalized.trim()) return null

  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let bestKeyword: { amount: number; label: string } | null = null

  for (const line of lines) {
    if (!TOTAL_KEYWORDS.test(line)) continue
    const nums = parseNumbersFromFragment(line)
    if (!nums.length) continue
    const amount = Math.max(...nums)
    if (!bestKeyword || amount >= bestKeyword.amount) {
      bestKeyword = { amount, label: line.slice(0, 120) }
    }
  }
  if (bestKeyword) {
    return {
      amount: bestKeyword.amount,
      label: bestKeyword.label,
      confidence: "high",
      method: "keyword",
    }
  }

  const allNums = parseNumbersFromFragment(normalized)
  if (!allNums.length) return null
  const amount = Math.max(...allNums)
  return {
    amount,
    label: "max numeric",
    confidence: allNums.length > 3 ? "medium" : "low",
    method: "max",
  }
}

export async function extractQuoteAmountWithVision(fileUrl: string): Promise<ParsedQuoteAmount | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.OPENAI_ERP_AI_MODEL?.trim() || "gpt-4o-mini"
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            'You extract the final payable total from Thai restaurant/interior quote documents. Reply JSON only: {"amount": number, "label": string}. amount is THB without commas. If unknown use amount 0.',
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the final total quote amount in Thai Baht from this document image.",
            },
            { type: "image_url", image_url: { url: fileUrl } },
          ],
        },
      ],
    }),
  })

  if (!res.ok) return null
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const raw = json.choices?.[0]?.message?.content?.trim() || ""
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as { amount?: number; label?: string }
    const amount = Number(parsed.amount)
    if (!Number.isFinite(amount) || amount <= 0) return null
    return {
      amount,
      label: String(parsed.label || "vision"),
      confidence: "high",
      method: "vision",
    }
  } catch {
    return null
  }
}

export async function extractQuoteAmountFromFileUrl(
  fileUrl: string,
  fileName: string
): Promise<{ result: ParsedQuoteAmount | null; openaiUsed: boolean }> {
  const lower = fileName.toLowerCase()
  const isPdf = lower.endsWith(".pdf")
  const isImage = /\.(png|jpe?g|webp|gif)$/.test(lower)

  try {
    const res = await fetch(fileUrl, { cache: "no-store" })
    if (!res.ok) return { result: null, openaiUsed: false }
    const buf = await res.arrayBuffer()

    if (isPdf) {
      const text = extractRoughPdfText(buf)
      const parsed = parseQuoteAmountFromText(text)
      if (parsed) return { result: parsed, openaiUsed: false }
    }

    if (isImage) {
      const parsed = parseQuoteAmountFromText(new TextDecoder().decode(buf))
      if (parsed && parsed.confidence === "high") {
        return { result: parsed, openaiUsed: false }
      }
      const vision = await extractQuoteAmountWithVision(fileUrl)
      if (vision) return { result: vision, openaiUsed: true }
      if (parsed) return { result: parsed, openaiUsed: false }
    }

    if (isPdf) {
      const vision = await extractQuoteAmountWithVision(fileUrl)
      if (vision) return { result: vision, openaiUsed: true }
    }
  } catch {
    // fall through
  }

  return { result: null, openaiUsed: false }
}
