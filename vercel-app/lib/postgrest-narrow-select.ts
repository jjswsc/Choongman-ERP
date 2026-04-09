/**
 * PostgREST 조회 시 컬럼을 제한해 Database Egress를 줄입니다.
 * supabaseSelect / supabaseSelectFilter 의 options.select 에 넣어 사용합니다.
 */

/** 공지 목록·필터링에 필요한 컬럼 */
export const NOTICE_LIST_COLS =
  'id,title,content,sender,target_store,target_role,target_permission_group,target_recipients,created_at,attachments'

/** 관리자 주문 목록·상세 조합에 필요한 컬럼 */
export const ORDERS_ADMIN_LIST_COLS =
  'id,order_date,store_name,user_name,cart_json,total,status,delivery_status,delivery_date,delivery_dates_by_outbound,received_indices,approved_indices,approved_original_qty_json,reject_reason'

/** 기간 내 매장 드롭다운용 (store_name 만) */
export const ORDERS_STORE_NAME_COLS = 'store_name'

/** 출고 이력: 미수령 Approved 주문 후보 */
export const ORDERS_COMBINED_PENDING_COLS =
  'id,store_name,order_date,delivery_date,cart_json,received_indices'

/** 매장 주문 이력 */
export const ORDERS_MY_HISTORY_COLS =
  'id,order_date,delivery_date,delivery_dates_by_outbound,cart_json,total,status,delivery_status,received_indices,received_qty_json,original_order_qty_json,user_name,reject_reason'

/** 급여·근태 집계(행 단위 처리) */
export const ATTENDANCE_LOG_PAYROLL_COLS =
  'id,log_at,store_name,name,employee_id,employee_code,log_type,late_min,early_min,ot_min,break_min,status,approved'

/** attendance_logs.employee_code 미배포 DB용 */
export const ATTENDANCE_LOG_PAYROLL_COLS_NO_CODE =
  'id,log_at,store_name,name,employee_id,log_type,late_min,early_min,ot_min,break_min,status,approved'

/** 관리자 근태표(일별 집계) */
export const ATTENDANCE_LOG_ADMIN_GRID_COLS =
  'id,log_at,store_name,name,employee_id,employee_code,log_type,late_min,early_min,ot_min,break_min,status,approved'

/** attendance_logs.employee_code 미배포 DB용 */
export const ATTENDANCE_LOG_ADMIN_GRID_COLS_NO_CODE =
  'id,log_at,store_name,name,employee_id,log_type,late_min,early_min,ot_min,break_min,status,approved'

/** 패티캐시 목록·월별 상세 */
export const PETTY_CASH_LIST_COLS =
  'id,store,trans_date,trans_type,amount,balance_after,memo,receipt_url,user_name,account_subject_id'

/** 출고 통합 이력: Outbound / ForceOutbound 로그 */
export const STOCK_LOG_OUTBOUND_HISTORY_COLS =
  'id,log_type,log_date,vendor_target,item_code,item_name,qty,order_id,delivery_status,invoice_unit_price'
