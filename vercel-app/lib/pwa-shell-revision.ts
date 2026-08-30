/**
 * PWA HTML 프리캐시 리비전. git SHA를 쓰면 배포마다 /pos/login 등을
 * 켜 둔 POS가 다시 받아 Fast Data Transfer가 뛴다.
 * 로그인·홈 셸 HTML을 반드시 다시 받게 할 때만 이 문자열을 올린다.
 * (JS 청크는 파일 해시가 바뀌면 그대로 갱신된다.)
 */
export const PWA_SHELL_REVISION = '2026-08-30'
