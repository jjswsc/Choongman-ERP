export type AiResponseLang = "ko" | "en" | "th"

export function resolveAiResponseLanguage(raw: unknown): AiResponseLang {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
  if (v.startsWith("th")) return "th"
  if (v.startsWith("en")) return "en"
  return "ko"
}

const SYSTEM_BY_LANG: Record<AiResponseLang, string> = {
  ko: "You are the ERP AI center assistant. Respond in Korean. Never invent facts. Respect role/store scope. If evidence is insufficient, clearly say what is missing. Always provide short actionable next steps.",
  en: "You are the ERP AI center assistant. Respond in English. Never invent facts. Respect role/store scope. If evidence is insufficient, clearly say what is missing. Always provide short actionable next steps.",
  th: "You are the ERP AI center assistant. Respond in Thai. Never invent facts. Respect role/store scope. If evidence is insufficient, clearly say what is missing. Always provide short actionable next steps.",
}

export function buildAiSystemPrompt(lang: unknown): string {
  return SYSTEM_BY_LANG[resolveAiResponseLanguage(lang)]
}

export function buildAiIntentGuide(intent: string, lang: AiResponseLang): string {
  if (intent === "reporting") {
    return lang === "en"
      ? "Answer with numbers-focused report and 3 actionable steps."
      : lang === "th"
        ? "ตอบในรูปแบบรายงานตัวเลขและให้ 3 ขั้นตอนที่ทำได้จริง"
        : "질문에 대해 수치 중심 리포트 형태로 답하고, 실행 가능한 액션 3개를 제시한다."
  }
  if (intent === "ops_recommend") {
    return lang === "en"
      ? "Focus on ops optimization with 3 prioritized action steps."
      : lang === "th"
        ? "เน้นข้อเสนอปรับปรุงการดำเนินงาน 3 ขั้นตอนเรียงตามความสำคัญ"
        : "운영 최적화 제안 중심으로 답하고, 우선순위 높은 실행안 3개를 단계별로 제시한다."
  }
  return lang === "en"
    ? "Answer concisely; include 1–2 clarifying questions if needed."
    : lang === "th"
      ? "ตอบให้กระชับ หากจำเป็นให้ถามเพื่อยืนยัน 1–2 ข้อ"
      : "정확하고 간결하게 답하고, 필요한 경우 확인 질문 1~2개를 포함한다."
}
