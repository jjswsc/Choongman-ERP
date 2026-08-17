/** Postgres 57014 / PostgREST statement timeout — 같은 무거운 쿼리를 재시도하면 더 느려진다. */

export function isSupabaseStatementTimeoutError(err: unknown): boolean {
  const msg =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : err != null
          ? String(err)
          : ''
  return /57014|statement timeout|canceling statement due to statement timeout/i.test(msg)
}
