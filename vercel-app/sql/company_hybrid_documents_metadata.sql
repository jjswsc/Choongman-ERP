-- 회사 하이브리드 문서: 공문 등 확장 메타(JSONB)
-- 기존 DB에 한 번 적용. (company_hybrid_documents 테이블이 있을 때)

alter table public.company_hybrid_documents
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.company_hybrid_documents.metadata is
  '확장 메타(JSON). correspondence: 발신/수신(outbound|inbound), 상대(counterparty), 문서번호(officialRef), 상태(status), 회신기한(replyDue), 채널(channel).';
