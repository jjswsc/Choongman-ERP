/**
 * PWA HTML 프리캐시 리비전. git SHA를 쓰면 배포마다 /pos/login 등을
 * 켜 둔 POS가 다시 받아 Fast Data Transfer가 뛴다.
 * 로그인·홈 셸 HTML을 반드시 다시 받게 할 때만 이 문자열을 올린다.
 * 2026-09-11: Windows POS는 SW를 끄고, 해시 JS는 HTML 오류 페이지를 캐시하지 않는다.
 * (JS 청크는 파일 해시가 바뀌면 그대로 갱신된다.)
 */
export const PWA_SHELL_REVISION = '2026-09-11'

/**
 * 회원앱 `/m` 은 2026-10-01 이후 프리캐시하지 않음(스피너 고착 방지).
 * 과거 상수명은 테스트·문서 호환용으로만 남긴다.
 */
export const PWA_MEMBER_SHELL_REVISION = '2026-10-01-no-precache'
