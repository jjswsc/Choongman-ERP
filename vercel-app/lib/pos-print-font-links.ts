/**
 * 열전사 HTML 인쇄용 폰트 링크.
 *
 * 이전: Google Fonts CDN (Noto Sans Thai) — 매 인쇄마다 외부 네트워크 요청 → 2~5초 지연.
 * 현재: 빈 문자열. CSS font-family 정의(Leelawadee UI, Tahoma, Noto Sans Thai 등)가
 *       OS 설치 폰트로 폴백하므로 Windows·Android 모두 태국어 정상 출력.
 *       Electron `document.fonts.ready` 도 외부 웹폰트 없이 즉시 resolve → settle 단축.
 */
export const POS_PRINT_NOTO_SANS_THAI_FONT_LINKS = ''
