-- attendance_logs: "휴식종료" 중복 적재 정리 스크립트 (최근분 + 조정 이력 제외)
-- 목적:
-- 1) 같은 직원이 같은 시각(초 단위)에 같은 break_min으로 중복 저장된 행을 정리
-- 2) 최근 N일 데이터만 대상으로 제한
-- 3) attendance_log_adjustments 이력이 있는 로그는 삭제 대상에서 제외
-- 4) 가장 이른 id 1건만 남기고 나머지 중복 행 삭제
--
-- 사용 순서:
-- A. 최근 N일 설정값(v_recent_days)을 조정
-- B. 스크립트 실행 후 건수/샘플 확인
-- C. 그대로 DELETE까지 실행하거나, DELETE 문만 주석 처리 후 검토 전용으로 사용

begin;

drop table if exists tmp_break_resume_dupes;

create temporary table tmp_break_resume_dupes as
with params as (
  select 30::int as v_recent_days
),
base as (
  select
    l.id,
    l.log_at,
    l.store_name,
    l.name,
    l.employee_id,
    l.employee_code,
    l.break_min,
    date_trunc('second', l.log_at) as log_at_sec,
    coalesce(
      case when l.employee_id is not null then 'id:' || l.employee_id::text end,
      case
        when coalesce(trim(l.employee_code), '') <> ''
          then 'code:' || upper(regexp_replace(l.employee_code, '[^A-Za-z0-9]', '', 'g'))
      end,
      'name:' || coalesce(trim(l.name), '')
    ) as employee_key
  from public.attendance_logs l
  cross join params p
  where l.log_type = '휴식종료'
    and l.log_at >= (now() - make_interval(days => p.v_recent_days))
    and not exists (
      select 1
      from public.attendance_log_adjustments a
      where a.attendance_log_id = l.id
    )
),
ranked as (
  select
    *,
    row_number() over (
      partition by store_name, employee_key, log_at_sec, round(coalesce(break_min, 0)::numeric, 2)
      order by id asc
    ) as rn
  from base
)
select
  id,
  log_at,
  store_name,
  name,
  employee_id,
  employee_code,
  break_min
from ranked
where rn > 1;

-- 1) 현재 설정된 최근 N일
with params as (select 30::int as v_recent_days)
select v_recent_days as recent_days_window
from params;

-- 2) 삭제 대상 총 건수
select count(*) as duplicate_rows_to_delete
from tmp_break_resume_dupes;

-- 3) 삭제 대상 샘플(최신순 100건)
select *
from tmp_break_resume_dupes
order by log_at desc, id desc
limit 100;

-- 4) 실제 삭제 (검토 후 실행)
delete from public.attendance_logs l
using tmp_break_resume_dupes d
where l.id = d.id;

-- 5) 삭제 결과 확인
select count(*) as remaining_tmp_rows
from tmp_break_resume_dupes;

commit;

