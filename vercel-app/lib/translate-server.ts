/**
 * 서버 전용 번역 유틸 (FCM 알림 등)
 * Google → MyMemory 런타임과 동일 경로 (ko 스킵 금지)
 */
import { translateTextsRuntime } from '@/lib/translate-runtime'

export async function translateTextsServer(
  texts: string[],
  targetLang: string
): Promise<string[]> {
  return translateTextsRuntime(texts, targetLang, 3)
}
