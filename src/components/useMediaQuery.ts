import { useCallback, useSyncExternalStore } from 'react'

/**
 * Подписка на медиазапрос. Нужен там, где брейкпоинт меняет не оформление,
 * а сами данные (например число столбиков графика): дублировать узлы и прятать
 * лишний через `lg:hidden` в таком случае значит держать в дереве доступности
 * два одинаковых блока - скринридер прочитает оба.
 *
 * Через `useSyncExternalStore`, а не `useState` + эффект: так нет вспышки
 * неверного значения на первом кадре.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // На сервере/в прекэше окна нет - считаем экран узким (мобайл-first).
    () => false,
  )
}

/** Десктопный брейкпоинт проекта - тот же, что у `lg:` в Tailwind. */
export const DESKTOP_QUERY = '(min-width: 1024px)'
