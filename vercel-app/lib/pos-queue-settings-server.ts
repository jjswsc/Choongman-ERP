import 'server-only'

import {
  POS_QUEUE_SETTING_KEYS,
  posQueueConfigFromMap,
  type PosQueueConfig,
} from '@/lib/pos-queue-settings'
import type { TenantSettingsScope } from '@/lib/tenant-system-settings'
import { loadTenantScopedSystemSettingsMap } from '@/lib/tenant-system-settings-server'

const LEGACY_SCOPE: TenantSettingsScope = { enforce: false, tenantId: '' }
const KEYS = Object.values(POS_QUEUE_SETTING_KEYS)

export async function loadPosQueueConfig(): Promise<PosQueueConfig> {
  try {
    return posQueueConfigFromMap(await loadTenantScopedSystemSettingsMap(KEYS, LEGACY_SCOPE))
  } catch {
    return posQueueConfigFromMap(new Map())
  }
}
