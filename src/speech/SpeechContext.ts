import { createContext } from 'react'
import type { Speech } from '@/speech/useSpeech'
import type { AudioRegion } from '@/types'

/**
 * Общий экземпляр озвучки на приложение: одна подписка на `voiceschanged`
 * на всех. Настройки читаются один раз и обновляются через `reload`
 * после правки в Настройках.
 *
 * В отдельном файле от `SpeechProvider` - react-refresh требует, чтобы модуль
 * с компонентом не экспортировал ничего, кроме компонентов (как `RepoContext`).
 */
export interface SpeechContextValue extends Speech {
  rate: number
  /** Автопроигрывать лицо карточки при показе. */
  autoplay: boolean
  /** Акцент синтеза: US/UK. Задаёт и голос облака, и голос устройства. */
  audioRegion: AudioRegion
  /** Включён ли облачный синтез фраз. */
  cloud: boolean
  /** Закреплённый голос устройства или null (авто). Только для локального синтеза. */
  voiceURI: string | null
  /** Перечитать настройки после сохранения (Настройки → озвучка). */
  reload: () => void
}

export const SpeechContext = createContext<SpeechContextValue | null>(null)
