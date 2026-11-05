// Notificaciones push (Web Push) del lado del navegador.
import { supabase } from '@/lib/supabase'

/** Clave pública VAPID (la privada vive solo como secreto de la Edge Function). */
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || undefined

export type PushSupport =
  /** Faltan las claves VAPID: la función está desactivada. */
  | 'unconfigured'
  /** iPhone/iPad en Safari: solo funciona con la app instalada en la pantalla de inicio. */
  | 'needs-install'
  | 'unsupported'
  | 'ok'

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC_KEY) return 'unconfigured'
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (capable) return 'ok'
  return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
}

export function notificationPermission(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'denied'
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready
}

/** Suscripción push de ESTE dispositivo (si existe). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  try {
    return await (await registration()).pushManager.getSubscription()
  } catch {
    return null
  }
}

async function saveToServer(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) throw new Error('La suscripción del navegador está incompleta.')
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) throw error
}

/** Pide permiso (debe llamarse desde un gesto del usuario), suscribe y guarda en el servidor. */
export async function enablePush(): Promise<void> {
  if (pushSupport() !== 'ok') throw new Error('Este dispositivo no admite notificaciones.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador o del sistema.'
        : 'No se concedió el permiso de notificaciones.',
    )
  }
  const reg = await registration()
  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) }
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe(options)
    } catch (err) {
      // Si cambiaron las claves VAPID, la suscripción vieja bloquea la nueva.
      if ((err as DOMException).name !== 'InvalidStateError') throw err
      await (await reg.pushManager.getSubscription())?.unsubscribe()
      sub = await reg.pushManager.subscribe(options)
    }
  }
  await saveToServer(sub)
}

/** Desactiva las notificaciones en este dispositivo. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/**
 * Re-asocia este dispositivo con el usuario actual (si ya dio permiso y está suscrito).
 * Cubre dispositivos compartidos y suscripciones que el navegador renovó.
 */
export async function syncSubscription(): Promise<void> {
  if (pushSupport() !== 'ok' || notificationPermission() !== 'granted') return
  const sub = await currentSubscription()
  if (sub) await saveToServer(sub)
}

/** Al cerrar sesión: este dispositivo deja de recibir avisos del usuario que sale. */
export async function detachFromUser(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
}

/** Notificación local de prueba (comprueba permisos y service worker, sin pasar por el servidor). */
export async function showTestNotification(): Promise<void> {
  const reg = await registration()
  await reg.showNotification('Notificaciones activadas', {
    body: 'Así verás los resultados y cuándo te toca jugar.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'test',
    data: { url: '/' },
  })
}
