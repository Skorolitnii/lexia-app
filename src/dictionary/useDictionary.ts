import { useQuery } from '@tanstack/react-query'
import { lookupTerm, lookupWord, WordNotFound, type Lookup } from '@/dictionary/api'
import { useDebounced } from '@/lib/useDebounced'

/** Пауза после ввода перед запросом - чтобы не дёргать словарь на каждую букву. */
const DEBOUNCE_MS = 500

export interface DictionaryState {
  data: Lookup | null
  loading: boolean
  /** Слово не найдено - обычный исход, показываем мягко, а не как ошибку. */
  notFound: boolean
  /** Сеть/сервер: офлайн или словарь недоступен. */
  failed: boolean
  /**
   * Словарь дал окончательный ответ по текущему слову (нашлось или нет).
   * Только в этом случае можно затирать транскрипцию/аудио: пока ответа нет,
   * у открытой на редактирование заметки уже лежат свои значения.
   */
  resolved: boolean
}

/**
 * Лукап по слову с debounce и кэшем (§4, §7).
 * Пропускается для фраз, cloze и пустого ввода - словарь знает только слова.
 */
export function useDictionary(front: string, enabled: boolean): DictionaryState {
  const debounced = useDebounced(front.trim(), DEBOUNCE_MS)
  // Слово для запроса: `lookupTerm` срезает ведущее «to» (to stir → stir) и
  // приводит к нижнему регистру; null - лукап не нужен (фраза, cloze, кириллица).
  const word = lookupTerm(debounced)
  const active = enabled && word !== null

  const query = useQuery({
    queryKey: ['dictionary', word],
    queryFn: ({ signal }) => lookupWord(word!, signal),
    enabled: active,
    // «Слово не найдено» - валидный ответ словаря, а не сбой: повторять незачем.
    // Своя функция полностью перекрывает `retry` из QueryClient, поэтому число
    // попыток задаётся здесь: одна повторная на сетевых сбоях.
    retry: (failureCount, error) => !(error instanceof WordNotFound) && failureCount < 1,
  })

  if (!active) {
    return {
      data: null,
      loading: false,
      notFound: false,
      failed: false,
      resolved: false,
    }
  }

  // Опираемся на итоговый `status`, а не на промежуточные isFetching/isPending:
  // между попытками retry они противоречат друг другу - по isFetching подсказка
  // гасла в пустоту, по isPending залипала на «Ищу в словаре…» (ловили оба).
  const notFound = query.error instanceof WordNotFound
  const failed = query.status === 'error' && !notFound
  // Пока идёт debounce, запрос ещё даже не ушёл - это тоже «грузится».
  const loading = debounced !== front.trim() || query.status === 'pending'

  return {
    data: query.data ?? null,
    loading,
    notFound,
    failed,
    // Сетевая ошибка - не ответ: затирать по ней уже подставленные значения
    // нельзя, иначе офлайн стирал бы транскрипцию у открытой заметки.
    resolved: query.status === 'success' || notFound,
  }
}
