/**
 * 로그인 JWT·cm_token 쿠키 수명 (서버·클라이언트 공통).
 * 현장 폰은 한 번 로그인하면 오래 유지. Chrome 쿠키 상한(400일) 안쪽.
 */
export const AUTH_TOKEN_TTL_SEC = 365 * 24 * 60 * 60
export const AUTH_TOKEN_JWT_EXPIRY = "365d"

/** 남은 수명이 이보다 짧으면 앱을 열 때 토큰을 재발급(슬라이딩). 기존 7일 토큰도 다음 접속에 1년으로 승격. */
export const AUTH_TOKEN_REFRESH_WITHIN_SEC = 30 * 24 * 60 * 60
