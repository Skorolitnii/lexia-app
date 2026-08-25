import { useEffect } from 'react'
import { Rating, type Grade } from 'ts-fsrs'

const NUMBER_TO_GRADE: Record<string, Grade> = {
  '1': Rating.Again,
  '2': Rating.Hard,
  '3': Rating.Good,
  '4': Rating.Easy,
}

/** Тренировка: «Ещё раз» (в конец очереди) и «Дальше» (убрать из очереди). */
const CRAM_NUMBER_TO_GRADE: Record<string, Grade> = {
  '1': Rating.Again,
  '2': Rating.Good,
}

interface HotkeyHandlers {
  revealed: boolean
  reveal: () => void
  rate: (rating: Grade) => void
  undo: () => void
  exit: () => void
  enabled: boolean
  /** Тренировка: на экране две кнопки, значит и клавиш должно быть две. */
  cram?: boolean
}

/**
 * Десктоп-хоткеи сессии: Space - раскрыть, Z - undo, Esc - выход.
 * Оценка: в повторении 1–4 (Again→Easy), в тренировке только 1 («Ещё раз») и
 * 2 («Дальше») - клавиши обязаны совпадать с тем, что видно на экране, иначе
 * «4» молча ставила бы Easy там, где такой кнопки нет.
 */
export function useStudyHotkeys({
  revealed,
  reveal,
  rate,
  undo,
  exit,
  enabled,
  cram = false,
}: HotkeyHandlers) {
  useEffect(() => {
    if (!enabled) return

    function onKeyDown(e: KeyboardEvent) {
      // Не перехватываем ввод в полях.
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (!revealed) reveal()
        return
      }
      if (e.key === 'Escape') {
        exit()
        return
      }
      if (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я') {
        undo()
        return
      }
      // Оценка доступна только после раскрытия.
      const grade = (cram ? CRAM_NUMBER_TO_GRADE : NUMBER_TO_GRADE)[e.key]
      if (grade !== undefined && revealed) rate(grade)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [revealed, reveal, rate, undo, exit, enabled, cram])
}
