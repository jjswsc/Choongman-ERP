import { describe, expect, it } from 'vitest'
import { isGrabMenuNotificationBusyError } from '@/lib/grab-menu-notification-busy'

describe('isGrabMenuNotificationBusyError', () => {
  it('treats Grab 409 as menu sync already running', () => {
    expect(
      isGrabMenuNotificationBusyError(
        new Error('Grab API error: 409 {"message":"menu sync is in progress"}')
      )
    ).toBe(true)
  })

  it('does not treat merchant resolution or 400 as busy', () => {
    expect(isGrabMenuNotificationBusyError(new Error('grab_menu_notification_merchant_unresolved'))).toBe(
      false
    )
    expect(isGrabMenuNotificationBusyError(new Error('Grab API error: 400 invalid merchant'))).toBe(false)
  })
})
