-- 슈퍼바이저 하루 업무표 파일럿 템플릿 (문서의 매일 확인 6항목) + 매니저·직원 빈 초안
-- 1회만 실행. 이미 같은 이름 템플릿이 있으면 건너뜀.

WITH sv AS (
  INSERT INTO routine_templates (name, role_scope, position, status, note, updated_by)
  SELECT '슈퍼바이저 기본 (파일럿)', 'supervisor', 'all', 'pilot',
         '현장에서 7시간 안에 가능한지 검증 후 운영(active)으로 전환', 'seed'
  WHERE NOT EXISTS (SELECT 1 FROM routine_templates WHERE name = '슈퍼바이저 기본 (파일럿)')
  RETURNING id
)
INSERT INTO routine_template_items
  (template_id, sort_order, time_slot, block, category, title, description, est_minutes, per_store, link_type, photo_required)
SELECT sv.id, x.sort_order, x.time_slot, x.block, x.category, x.title, x.description, x.est_minutes, x.per_store, x.link_type, x.photo_required
FROM sv
CROSS JOIN (VALUES
  (10, '09:00', '브리핑', '당일 과제', '아침 브리핑 확인', '담당 매장·전날 미완료·본사 과제 확인, 예상 소요시간 점검', 15, false, 'none', false),
  (20, '09:15', '브리핑', '당일 과제', '미완료 개선 과제 확인', '재확인 대기·기한초과 과제 우선순위 정리', 10, false, 'store_actions', false),
  (30, '', '매장', '인원', '인원 현황 확인', '출근 인원·결원·신규 직원·채용 필요 포지션·근무표 문제·장기 결원', 10, true, 'schedule', false),
  (40, '', '매장', '시설', '시설 확인', '테이블·의자·POS/프린터·주방 장비·에어컨·전기/수도·반복 고장 설비', 15, true, 'none', false),
  (50, '', '매장', '교육', '신규 직원 교육 상태 확인', '교육 진행·숙련도·재교육·매니저 교육 수행·POS 사용법', 15, true, 'none', false),
  (60, '', '매장', '재고·발주', '재고·발주 확인', '부족/과다 재고·발주 누락·주요 원재료 재고일수', 10, true, 'none', false),
  (70, '', '매장', '청결', '청결·매장 컨디션 점검', '홀·주방·창고·냉장/냉동·직원 공간·홍보물·음악', 20, true, 'store_check', true),
  (80, '', '매장', '당일 과제', '발견 문제 개선 과제 등록', '문제는 담당자+기한+재확인자까지 지정', 10, true, 'store_actions', false),
  (90, '16:30', '마감', '당일 과제', '업무 종료 보고', '완료/미완료·미완료 사유·내일 넘길 일 정리 후 마감', 15, false, 'none', false)
) AS x(sort_order, time_slot, block, category, title, description, est_minutes, per_store, link_type, photo_required);

INSERT INTO routine_templates (name, role_scope, position, status, note, updated_by)
SELECT '매니저 기본 (초안)', 'manager', 'all', 'draft', '슈퍼바이저 검증 후 항목을 채워 파일럿으로 전환', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM routine_templates WHERE name = '매니저 기본 (초안)');

INSERT INTO routine_templates (name, role_scope, position, status, note, updated_by)
SELECT '직원 홀·카운터 (초안)', 'staff', 'service', 'draft', '근무표 구역이 Service인 직원에게 적용', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM routine_templates WHERE name = '직원 홀·카운터 (초안)');

INSERT INTO routine_templates (name, role_scope, position, status, note, updated_by)
SELECT '직원 주방 (초안)', 'staff', 'kitchen', 'draft', '근무표 구역이 Kitchen인 직원에게 적용', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM routine_templates WHERE name = '직원 주방 (초안)');
