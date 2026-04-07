type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export interface LlmResult {
  text: string
  model: string | null
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null
}

export async function runChatCompletion(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LlmResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return {
      text: "",
      model: null,
      usage: null,
    }
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
      messages,
    }),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${bodyText.slice(0, 300)}`)
  }
  const json = JSON.parse(bodyText) as {
    model?: string
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }
  return {
    text: json.choices?.[0]?.message?.content?.trim() || "",
    model: json.model ?? model,
    usage: json.usage
      ? {
          promptTokens: Number(json.usage.prompt_tokens || 0),
          completionTokens: Number(json.usage.completion_tokens || 0),
          totalTokens: Number(json.usage.total_tokens || 0),
        }
      : null,
  }
}

