import { useEffect, useState } from 'react'

/**
 * Debounce значения: возвращаемое значение обновляется только когда входное
 * перестало меняться на `delay` мс. Нужно, чтобы поиск в библиотеке и лукап в
 * словаре не слали запрос на каждую нажатую букву.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
