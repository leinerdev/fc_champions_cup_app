import { useCallback, useEffect, useState } from 'react'
import {
  currentSubscription,
  disablePush,
  enablePush,
  notificationPermission,
  pushSupport,
  type PushSupport,
} from '@/lib/push'

export interface PushState {
  support: PushSupport
  permission: NotificationPermission
  /** Este dispositivo está suscrito. */
  subscribed: boolean
  /** Terminó la comprobación inicial. */
  ready: boolean
  busy: boolean
  enable: () => Promise<void>
  disable: () => Promise<void>
}

export function usePush(): PushState {
  const [support] = useState<PushSupport>(() => pushSupport())
  const [permission, setPermission] = useState<NotificationPermission>(() => notificationPermission())
  const [subscribed, setSubscribed] = useState(false)
  const [ready, setReady] = useState(support !== 'ok')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (support !== 'ok') return
    let cancelled = false
    void currentSubscription().then((sub) => {
      if (cancelled) return
      setSubscribed(Boolean(sub) && notificationPermission() === 'granted')
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [support])

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      await enablePush()
      setSubscribed(true)
    } finally {
      setPermission(notificationPermission())
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      await disablePush()
      setSubscribed(false)
    } finally {
      setBusy(false)
    }
  }, [])

  return { support, permission, subscribed, ready, busy, enable, disable }
}
