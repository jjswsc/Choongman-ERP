-- LINE OA + 자사 앱 병행 시 members.source / member_identities 운영 규칙
-- 실행: Supabase SQL Editor (PostgreSQL)
--
-- 식별: members.id = 마스터 키. LINE은 member_identities(provider='line')로 선택 연동.

comment on table public.members is '회원 마스터. LINE OA는 단일 원장이 아니며 member_identities로 보조 연동.';
comment on column public.members.source is '권장 값: manual(ERP수동), app(앱·웹·관리자 마스터 등록), line(LINE동기화), line_import(CRM파일)';

create index if not exists idx_members_source on public.members (source);
