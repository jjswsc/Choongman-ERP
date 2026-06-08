'use client'

/**
 * @deprecated — `pos-offline-pilot.ts` 로 통합. 하위 import 호환용 re-export.
 */
export {
  isPosOfflineBootV2Enabled,
  isPosOfflinePhaseAEnabled,
  isPosOfflinePhaseBEnabled,
  isPosOfflinePhaseBEnabledForStore,
  isPosOfflinePhaseBEnabledOnPc,
  isPosOfflinePilotStore,
  persistOfflineBootV2FromQuery,
  persistOfflinePilotFromQuery,
  isHybridPosOfflineBootTarget,
  getPosOfflinePilotSnapshot,
} from '@/lib/pos-offline-pilot'
