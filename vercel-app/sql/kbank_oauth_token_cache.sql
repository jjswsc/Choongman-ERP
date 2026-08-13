-- KBank OAuth access token: shared cache + distributed lock (all Vercel instances).
-- Run in Supabase SQL Editor before relying on shared reuse (token endpoint: 5 / 30 min).
-- Service role only — never expose access_token to anon/authenticated clients.

CREATE TABLE IF NOT EXISTS public.kbank_oauth_token_cache (
  cache_key text PRIMARY KEY,
  access_token text NOT NULL,
  token_type text,
  expires_in integer,
  scope text,
  expires_at_ms bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kbank_oauth_token_lock (
  cache_key text PRIMARY KEY,
  lock_holder text NOT NULL,
  lock_until timestamptz NOT NULL
);

COMMENT ON TABLE public.kbank_oauth_token_cache IS
  'Shared KBank OAuth access_token cache. expires_at_ms already applies skew (e.g. -30s).';
COMMENT ON TABLE public.kbank_oauth_token_lock IS
  'Distributed lock so only one instance calls /v2/oauth/token at a time per cache_key.';

ALTER TABLE public.kbank_oauth_token_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kbank_oauth_token_lock ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.kbank_oauth_token_cache FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.kbank_oauth_token_lock FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.kbank_oauth_token_cache TO service_role;
GRANT ALL ON TABLE public.kbank_oauth_token_lock TO service_role;

CREATE OR REPLACE FUNCTION public.kbank_token_cache_get(
  p_cache_key text,
  p_now_ms bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.kbank_oauth_token_cache%ROWTYPE;
BEGIN
  SELECT * INTO r
  FROM public.kbank_oauth_token_cache
  WHERE cache_key = p_cache_key;

  IF FOUND
     AND coalesce(r.access_token, '') <> ''
     AND r.expires_at_ms > p_now_ms THEN
    RETURN jsonb_build_object(
      'hit', true,
      'access_token', r.access_token,
      'token_type', r.token_type,
      'expires_in', r.expires_in,
      'scope', r.scope,
      'expires_at_ms', r.expires_at_ms
    );
  END IF;

  RETURN jsonb_build_object('hit', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.kbank_token_lock_try(
  p_cache_key text,
  p_lock_holder text,
  p_ttl_seconds integer DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ttl int := greatest(5, least(coalesce(p_ttl_seconds, 20), 60));
  until_ts timestamptz := now() + make_interval(secs => ttl);
  got text;
BEGIN
  INSERT INTO public.kbank_oauth_token_lock (cache_key, lock_holder, lock_until)
  VALUES (p_cache_key, p_lock_holder, until_ts)
  ON CONFLICT (cache_key) DO UPDATE
    SET lock_holder = EXCLUDED.lock_holder,
        lock_until = EXCLUDED.lock_until
  WHERE public.kbank_oauth_token_lock.lock_until < now()
     OR public.kbank_oauth_token_lock.lock_holder = EXCLUDED.lock_holder
  RETURNING cache_key INTO got;

  RETURN got IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.kbank_token_lock_release(
  p_cache_key text,
  p_lock_holder text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.kbank_oauth_token_lock
  WHERE cache_key = p_cache_key
    AND lock_holder = p_lock_holder;
END;
$$;

CREATE OR REPLACE FUNCTION public.kbank_token_cache_put(
  p_cache_key text,
  p_access_token text,
  p_token_type text,
  p_expires_in integer,
  p_scope text,
  p_expires_at_ms bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.kbank_oauth_token_cache (
    cache_key, access_token, token_type, expires_in, scope, expires_at_ms, updated_at
  )
  VALUES (
    p_cache_key,
    p_access_token,
    nullif(trim(coalesce(p_token_type, '')), ''),
    p_expires_in,
    nullif(trim(coalesce(p_scope, '')), ''),
    p_expires_at_ms,
    now()
  )
  ON CONFLICT (cache_key) DO UPDATE
    SET access_token = EXCLUDED.access_token,
        token_type = EXCLUDED.token_type,
        expires_in = EXCLUDED.expires_in,
        scope = EXCLUDED.scope,
        expires_at_ms = EXCLUDED.expires_at_ms,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.kbank_token_cache_clear(p_cache_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.kbank_oauth_token_cache WHERE cache_key = p_cache_key;
  DELETE FROM public.kbank_oauth_token_lock WHERE cache_key = p_cache_key;
END;
$$;

REVOKE ALL ON FUNCTION public.kbank_token_cache_get(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kbank_token_lock_try(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kbank_token_lock_release(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kbank_token_cache_put(text, text, text, integer, text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kbank_token_cache_clear(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.kbank_token_cache_get(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.kbank_token_lock_try(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.kbank_token_lock_release(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kbank_token_cache_put(text, text, text, integer, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.kbank_token_cache_clear(text) TO service_role;
