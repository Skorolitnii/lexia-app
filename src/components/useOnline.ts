import { useSyncExternalStore } from 'react'

/**
 * Онлайн-статус браузера. Через `useSyncExternalStore`, как `useMediaQuery`:
 * без вспышки неверного значения на первом кадре.
 *
 * `navigator.onLine` знает только про физическую сеть, не про доступность
 * сервера - этого достаточно для честного индикатора «сервер недостижим»:
 * при живой сессии офлайн означает, что запросы к Supabase упадут.
 */
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // В прекэше/на сервере навигатора нет - считаем, что сеть есть.
    () => true,
  )
}
