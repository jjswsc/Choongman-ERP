-- 인사 규정 + 열람 확인 (Supabase SQL Editor에서 실행)
-- API는 service_role로 접근하나, anon 시 스키마 노출 시를 대비해 RLS+정책을 둡니다.

CREATE TABLE IF NOT EXISTS public.hr_policies (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  content text,
  target_store text NOT NULL DEFAULT '전체',
  target_role text NOT NULL DEFAULT '전체',
  target_permission_group text,
  target_recipients text,
  content_version integer NOT NULL DEFAULT 1,
  effective_at date,
  is_active boolean NOT NULL DEFAULT true,
  attachments text,
  sender text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_policies_created_at ON public.hr_policies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_policies_is_active ON public.hr_policies (is_active);

CREATE TABLE IF NOT EXISTS public.hr_policy_reads (
  id bigserial PRIMARY KEY,
  policy_id bigint NOT NULL REFERENCES public.hr_policies (id) ON DELETE CASCADE,
  store text NOT NULL,
  name text NOT NULL,
  read_at timestamptz,
  status text NOT NULL DEFAULT '확인',
  acknowledged_version integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_policy_reads_policy_store_name
  ON public.hr_policy_reads (policy_id, store, name);
CREATE INDEX IF NOT EXISTS idx_hr_policy_reads_policy_id ON public.hr_policy_reads (policy_id);

CREATE OR REPLACE FUNCTION public.trg_hr_policies_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_policies_updated_at ON public.hr_policies;
CREATE TRIGGER trg_hr_policies_updated_at
BEFORE UPDATE ON public.hr_policies
FOR EACH ROW EXECUTE PROCEDURE public.trg_hr_policies_set_updated_at();

ALTER TABLE public.hr_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_policy_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_policies_all_service" ON public.hr_policies;
CREATE POLICY "hr_policies_all_service"
  ON public.hr_policies FOR ALL
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "hr_policy_reads_all_service" ON public.hr_policy_reads;
CREATE POLICY "hr_policy_reads_all_service"
  ON public.hr_policy_reads FOR ALL
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.hr_policies IS '인사 규정 본문 및 발행 대상(공지 target_* 와 동일 의미)';
COMMENT ON TABLE public.hr_policy_reads IS '직원별 열람/확인(acknowledged_version=당시 content_version)';
