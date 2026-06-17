// Minimal service worker for browser-level notifications.
// Lets the app fire OS-level toasts via showNotification() even when the tab is backgrounded.
self.addEventListener('install', (event) => { self.skipWaiting() })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (all.length) { all[0].focus(); return }
      await self.clients.openWindow('/')
    })()
  )
})
