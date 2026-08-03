/**
 * API 클라이언트 (barrel)
 * core fetch/auth: lib/api/
 * 도메인별 클라이언트: lib/api-client/*.ts — import @/lib/api-client 유지
 * 쓰기 API는 apiFetchWithOffline → 오프라인 큐 적재
 */

export { apiFetch } from './api/fetch'
export { apiFetchWithOffline } from './api/fetch-offline'
export { loginCheck, changePassword } from './api/auth'
export { getLoginDataWithCache as getLoginData } from './offline/erp-offline'
export { useStoreList } from './use-store-list'
export {
  invalidateBankTransactionsListCache,
  invalidateReceivablePayableListCache,
  invalidatePurchaseOrdersListCache,
  invalidateAdminItemsCache,
} from './offline/erp-offline'
export type { MarketingCampaignPhasePeriod } from './marketing-campaign-periods'
export type { PaginatedList } from './api-client/types'
export type { AppItem } from './api-client/app-data-cache'
export { invalidateAppDataCache, getAppData } from './api-client/app-data-cache'

export * from './api-client/stock'
export * from './api-client/hr'
export * from './api-client/admin'
export * from './api-client/work-log'
export * from './api-client/timesheet'
export * from './api-client/visit'
export * from './api-client/petty-cash'
export * from './api-client/receivable-payable'
export * from './api-client/income-statement'
export * from './api-client/balance-sheet'
export * from './api-client/thai-tax-filing'
export * from './api-client/depreciation'
export * from './api-client/expense-management'
export * from './api-client/sales-management'
export * from './api-client/bank-transactions'
export * from './api-client/chart-of-accounts'
export * from './api-client/fixed-costs'
export * from './api-client/interior'
export * from './api-client/items-vendors'
export * from './api-client/pos-menus'
export * from './api-client/sauces'
export * from './api-client/pos-promos'
export * from './api-client/marketing-campaigns'
export * from './api-client/marketing-ads'
export * from './api-client/marketing-influencers'
export * from './api-client/pos-operations'
export * from './api-client/pos-settlement'
export * from './api-client/pos-payment-gateways'
export * from './api-client/qr-table'
export * from './api-client/inbound'
export * from './api-client/outbound'
export * from './api-client/employees'
export * from './api-client/store-check'
export * from './api-client/store-visit-admin'
export * from './api-client/complaints'
export * from './api-client/store-repairs'
export * from './api-client/system-settings'
export * from './api-client/purchase-order'
export * from './api-client/marketing-materials'
export * from './api-client/marketing-material-store-checks'
export * from './api-client/mobile-home'
export * from './api-client/crm-members'
