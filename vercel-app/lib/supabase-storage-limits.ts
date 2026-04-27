/**
 * Supabase Storage: 프로젝트 전역 단일 파일 크기 상한(버킷 `file_size_limit`에 쓸 때).
 * Free 플랜 등에서 50MB를 넘기면 버킷 생성 API가 413(Payload too large)로 실패할 수 있음.
 */
export const SUPABASE_STORAGE_SINGLE_FILE_MAX_BYTES = 50 * 1024 * 1024
