/**
 * POS 메뉴 화면·보드 설정 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'
import { jsonAsArray } from '../safe-api-json'

export interface PosMenuScreenConfig {
  storeCode: string | null
  scope?: 'dine-in' | 'delivery' | 'takeout'
  mainCategoryFontSize: number
  categoryFontSize: number
  menuTileFontSize: number
  menuTileCols: number
  menuListFontSize: number
  menuListPageSize: number
  kioskGroupFontSize: number
  updatedAt?: string | null
}

export async function getPosMenuScreenConfig(params?: {
  storeCode?: string
  scope?: 'dine-in' | 'delivery' | 'takeout'
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.scope) q.set('scope', params.scope)
  const qs = q.toString()
  const url = '/api/getPosMenuScreenConfig' + (qs ? `?${qs}` : '')
  const cacheKey = `erp:posMenuScreenConfig:${params?.storeCode?.trim() || 'default'}:${params?.scope || 'dine-in'}`
  const fallback: PosMenuScreenConfig = {
    storeCode: params?.storeCode?.trim() || null,
    scope: params?.scope || 'dine-in',
    mainCategoryFontSize: 18,
    categoryFontSize: 15,
    menuTileFontSize: 13,
    menuTileCols: 4,
    menuListFontSize: 14,
    menuListPageSize: 8,
    kioskGroupFontSize: 16,
  }
  return fetchPosCatalogCached<PosMenuScreenConfig>(cacheKey, url, fallback)
}

export async function savePosMenuScreenConfig(params: {
  storeCode?: string | null
  scope?: 'dine-in' | 'delivery' | 'takeout'
  mainCategoryFontSize: number
  categoryFontSize: number
  menuTileFontSize: number
  menuTileCols: number
  menuListFontSize: number
  menuListPageSize: number
  kioskGroupFontSize: number
}) {
  const res = await apiFetchWithOffline('/api/savePosMenuScreenConfig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface PosMenuBoardConfig {
  id: number
  storeCode: string
  boardType: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
  boardName: string
  groupGridCols: number
  groupGridRows: number
  menuGridCols: number
  menuGridRows: number
  resolutionWidth: number
  resolutionHeight: number
  groupCount: number
  menuCount: number
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export async function getPosMenuBoards(params?: {
  storeCode?: string
  boardType?: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
}) {
  const q = new URLSearchParams()
  if (params?.storeCode) q.set('storeCode', params.storeCode)
  if (params?.boardType) q.set('boardType', params.boardType)
  const res = await apiFetchWithOffline('/api/getPosMenuBoards?' + q.toString())
  return jsonAsArray<PosMenuBoardConfig>(await res.json())
}

export async function savePosMenuBoard(params: {
  id?: number
  storeCode: string
  boardType: 'dine_in' | 'delivery' | 'table_order' | 'tablet' | 'kiosk'
  boardName: string
  groupGridCols?: number
  groupGridRows?: number
  menuGridCols?: number
  menuGridRows?: number
  resolutionWidth?: number
  resolutionHeight?: number
  groupCount?: number
  menuCount?: number
  isActive?: boolean
}) {
  const res = await apiFetchWithOffline('/api/savePosMenuBoard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosMenuBoard(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/deletePosMenuBoard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
