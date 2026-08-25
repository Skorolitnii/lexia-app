import { useEffect, useState } from 'react'
import { useRepo } from '@/data/useRepo'
import { selectCls } from '@/components/formStyles'

/**
 * Настройки изучения. Пока одна - дневная норма новых слов: раньше она была
 * зашита в дефолты (20) и не показывалась, поэтому упереться в неё можно было
 * только через «Карточек нет, возвращайтесь позже», без шанса поменять.
 */

/** Норма новых слов в день. 50 - верх разумного: дальше вал повторений. */
const LIMITS = [5, 10, 15, 20, 30, 50]

export function StudySettings() {
  const repo = useRepo()
  const [limit, setLimit] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    void repo.getSettings().then((s) => {
      if (active) setLimit(s.new_cards_per_day)
    })
    return () => {
      active = false
    }
  }, [repo])

  const save = (value: number) => {
    setLimit(value)
    setSaving(true)
    void repo.updateSettings({ new_cards_per_day: value }).finally(() => setSaving(false))
  }

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[14.5px] font-semibold text-ink">Новых слов в день</div>
        <div className="mt-0.5 text-[12.5px] text-faint-2">
          Сколько новых карточек вводить за сутки. Больше нормы - больше повторений через несколько
          дней.
        </div>
      </div>
      <div className="shrink-0">
        <select
          aria-label="Новых слов в день"
          className={selectCls}
          // Пока настройки грузятся, значения нет - select не должен показывать чужое.
          value={limit ?? ''}
          disabled={limit === null || saving}
          onChange={(e) => save(Number(e.target.value))}
        >
          {limit === null && <option value="">…</option>}
          {LIMITS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          {/* Значение из бэкапа может не совпасть со списком - показываем его,
              иначе select молча съедет на первый пункт и «сохранит» его. */}
          {limit !== null && !LIMITS.includes(limit) && <option value={limit}>{limit}</option>}
        </select>
      </div>
    </div>
  )
}
