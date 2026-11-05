/* Notificaciones push de FC CHAMPIONS CUP.
 * Este archivo lo importa el service worker generado por vite-plugin-pwa (workbox.importScripts). */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  // En iOS y Chrome cada push DEBE mostrar una notificación (userVisibleOnly).
  const title = data.title || 'FC CHAMPIONS CUP'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((c) => new URL(c.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        // La app navega con su router (sin recargar).
        open.postMessage({ type: 'fccc:navigate', url: target.pathname + target.search })
        return
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})
