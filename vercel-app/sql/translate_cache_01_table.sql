-- 직원 UGC 자동번역 영구 캐시 (공지·업무일지·수리·점검 등)
-- 서버리스 인스턴스 메모리 캐시(800)와 병행. 테이블 없으면 런타임이 조용히 스킵.
-- pos_orders 등 Realtime 구독 테이블은 건드리지 않음 → 영업 중 실행 가능

CREATE TABLE IF NOT EXISTS public.translate_cache (
  cache_key text PRIMARY KEY,
  source_text text NOT NULL,
  target_lang text NOT NULL,
  translated text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translate_cache_lang_updated
  ON public.translate_cache (target_lang, updated_at DESC);

ALTER TABLE public.translate_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all translate_cache" ON public.translate_cache;
CREATE POLICY "Allow all translate_cache" ON public.translate_cache
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.translate_cache IS
  'UGC 자동번역 결과 캐시. cache_key = sha256(target_lang + NUL + source_text)';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('translate_cache_01_table.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
