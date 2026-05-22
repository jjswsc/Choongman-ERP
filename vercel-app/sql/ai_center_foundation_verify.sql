-- AI Center 0단계: ai_center_foundation.sql 적용 여부 확인
-- Supabase SQL Editor에서 전체 실행 → 모든 행 ok = true 이면 통과

SELECT 'ai_knowledge_chunks' AS table_name,
       to_regclass('public.ai_knowledge_chunks') IS NOT NULL AS ok
UNION ALL
SELECT 'ai_action_requests', to_regclass('public.ai_action_requests') IS NOT NULL
UNION ALL
SELECT 'ai_action_events', to_regclass('public.ai_action_events') IS NOT NULL
UNION ALL
SELECT 'ai_notice_drafts', to_regclass('public.ai_notice_drafts') IS NOT NULL
UNION ALL
SELECT 'ai_followup_tasks', to_regclass('public.ai_followup_tasks') IS NOT NULL
UNION ALL
SELECT 'ai_usage_logs', to_regclass('public.ai_usage_logs') IS NOT NULL
UNION ALL
SELECT 'external_store_profiles', to_regclass('public.external_store_profiles') IS NOT NULL
UNION ALL
SELECT 'external_context_daily', to_regclass('public.external_context_daily') IS NOT NULL
ORDER BY table_name;
