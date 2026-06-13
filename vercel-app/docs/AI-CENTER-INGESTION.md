# AI Center Ingestion Guide

## 목표
- ERP AI센터가 문서/내부 지식을 검색(RAG)할 수 있도록 `ai_knowledge_chunks`를 채운다.
- 권한/매장 스코프를 chunk 메타데이터에 포함해 데이터 노출을 통제한다.

## 준비
1. `sql/ai_center_foundation.sql` 실행
2. 환경 변수 설정
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## 기본 적재 명령
```bash
node scripts/ai-index-knowledge.cjs --source docs --sourceName docs --store All --role office
```

## 메타데이터 규칙
- `store_scope`
  - `All`: 전사 공통
  - 특정 매장명: 해당 매장 + 본사
- `role_scope`
  - 비움: AI센터 접근자 모두
  - `manager`: 매장 관리자 이상
  - `office`: 본사/회계 중심

## 운영 권장사항
- 주 1회 정기 인덱싱 + 중요한 정책 변경 시 수동 인덱싱
- 문서 파일명은 검색 품질을 위해 의미 있는 이름 사용
- 대용량 파일은 사전 분리 후 적재 권장

## 벡터 RAG (pgvector)

1. `sql/ai_knowledge_vector.sql` 실행 (extension + `search_ai_knowledge_chunks` RPC)
2. 인덱싱 시 임베딩 포함:
   ```bash
   node scripts/ai-index-knowledge.cjs --source docs --sourceName docs --store All --role office --embed
   ```
3. 기존 청크 백필:
   ```bash
   node scripts/ai-embed-knowledge-backfill.cjs --limit 500
   ```
4. `/api/ai/health` → `vectorSearchReady: true` 확인

## 외부 환경(날씨/휴일) 연동
1. `external_store_profiles`에 매장별 `lat`, `lon` 입력
2. 관리자 권한으로 아래 API 실행
   - `POST /api/ai/external/sync`
   - body 예: `{ "days": 7 }`
3. 결과는 `external_context_daily`에 저장되며, AI 질의에서 자동 참조됨

