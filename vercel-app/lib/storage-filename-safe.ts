/**
 * 객체 키용 허용 문자만 남김 (ASCII 영숫자·`.`·`_·`-`, 한글 음절).
 *
 * 문자 클래스 안에서 `_` 다음의 `-`를 **리터럴 하이픈이 아니라** `_-가`처럼
 * 넓은 유니코드 **범위**로 해석하면 태국어·키릴 문자 등이 허용되어
 * Storage가 `InvalidKey`로 거부할 수 있으므로, 하이픈은 **항목 끤**에 둠.
 */
export const STORAGE_FILENAME_SAFE = /[^a-zA-Z0-9가-힣._-]/g

/** Storage 세그먼트(예: 매장 슬러그)용 동일 규칙 (. 제외 버전 없이 위와 통일 가능) */
export const STORAGE_SEGMENT_SAFE = STORAGE_FILENAME_SAFE

function randomHex(lenBytes: number): string {
  const size = Math.max(1, Math.floor(lenBytes))
  const arr = new Uint8Array(size)
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(arr)
  } else {
    for (let i = 0; i < size; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 업로드 경로에는 비ASCII 원본 이름을 넣지 않음 — 표시명은 별도 메타로 유지.
 * Supabase 등이 키에 특정 비ASCII를 허용하지 않는 경우 방지.
 */
export function randomStorageObjectBasename(originalFileName: string): string {
  const trimmed = String(originalFileName || 'file').trim()
  const m = /\.([a-zA-Z0-9]{1,12})$/.exec(trimmed)
  const ext = m ? `.${m[1].toLowerCase()}` : ''
  const rand = randomHex(8)
  return `${Date.now()}-${rand}${ext}`
}
