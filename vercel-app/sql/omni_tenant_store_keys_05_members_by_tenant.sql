-- Omni만. 회원이 어느 법인에 붙었는지.
SELECT coalesce(nullif(btrim(tenant_id), ''), '(blank)') AS tenant_id,
       count(*) AS members
FROM public.members
GROUP BY 1
ORDER BY members DESC;
