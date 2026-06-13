type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export interface LlmResult {
  text: string
  model: string | null
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null
}

export async function runChatCompletion(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LlmResult> {
  const streamed = await collectChatCompletionStream(messages, options)
  return streamed
}

async function collectChatCompletionStream(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<LlmResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return { text: "", model: null, usage: null }
  }
  const model = process.env.OPENAI_ERP_AI_MODEL?.trim() || "gpt-4o-mini"
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 1200,
      stream: true,
      stream_options: { include_usage: true },
      messages,
    }),
  })
  if (!res.ok || !res.body) {
    const bodyText = await res.text().catch(() => "")
    throw new Error(`OpenAI request failed (${res.status}): ${bodyText.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let usage: LlmResult["usage"] = null
  let resolvedModel = model

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const payload = trimmed.slice(5).trim()
      if (payload === "[DONE]") continue
      try {
        const json = JSON.parse(payload) as {
          model?: string
          choices?: { delta?: { content?: string } }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        }
        if (json.model) resolvedModel = json.model
        const delta = json.choices?.[0]?.delta?.content
        if (delta) text += delta
        if (json.usage) {
          usage = {
            promptTokens: Number(json.usage.prompt_tokens || 0),
            completionTokens: Number(json.usage.completion_tokens || 0),
            totalTokens: Number(json.usage.total_tokens || 0),
          }
        }
      } catch {
        // ignore partial SSE chunks
      }
    }
  }

  return { text: text.trim(), model: resolvedModel, usage }
}

/** SSE consumer용 — delta 텍스트 청크 yield */
export async function* streamChatCompletionDeltas(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): AsyncGenerator<{ type: "delta"; text: string } | { type: "done"; model: string | null; usage: LlmResult["usage"] }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    yield { type: "done", model: null, usage: null }
    return
  }
  const model = process.env.OPENAI_ERP_AI_MODEL?.trim() || "gpt-4o-mini"
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 1200,
      stream: true,
      stream_options: { include_usage: true },
      messages,
    }),
  })
  if (!res.ok || !res.body) {
    const bodyText = await res.text().catch(() => "")
    throw new Error(`OpenAI request failed (${res.status}): ${bodyText.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let usage: LlmResult["usage"] = null
  let resolvedModel = model

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const payload = trimmed.slice(5).trim()
      if (payload === "[DONE]") continue
      try {
        const json = JSON.parse(payload) as {
          model?: string
          choices?: { delta?: { content?: string } }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        }
        if (json.model) resolvedModel = json.model
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield { type: "delta", text: delta }
        if (json.usage) {
          usage = {
            promptTokens: Number(json.usage.prompt_tokens || 0),
            completionTokens: Number(json.usage.completion_tokens || 0),
            totalTokens: Number(json.usage.total_tokens || 0),
          }
        }
      } catch {
        // ignore
      }
    }
  }
  yield { type: "done", model: resolvedModel, usage }
}

