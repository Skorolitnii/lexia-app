/** Интервал до следующего показа в компактном виде: «<1м», «25м», «4д», «2мес». */
export function formatInterval(due: Date, now: Date): string {
  const minutes = Math.round((due.getTime() - now.getTime()) / 60_000)
  if (minutes < 1) return '<1м'
  if (minutes < 60) return `${minutes}м`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}ч`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days}д`

  const months = Math.round(days / 30)
  if (months < 12) return `${months}мес`

  return `${Math.round(months / 12)}г`
}

/** Длительность сессии: «7 минут», «45 секунд». */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))} сек`
  return `${minutes} мин`
}

/**
 * Срок заметки для списка библиотеки: «новое», «сегодня», «3д», «1мес».
 * `due` - ближайший срок среди карточек заметки; null - карточек нет.
 */
export function formatDue(
  due: Date | null,
  isNew: boolean,
  now: Date,
): { text: string; tone: 'new' | 'due' | 'later' } {
  if (isNew) return { text: 'новое', tone: 'new' }
  if (!due) return { text: '-', tone: 'later' }

  const ms = due.getTime() - now.getTime()
  if (ms <= 0) return { text: 'сегодня', tone: 'due' }

  // Math.round, как в formatInterval: через 25 часов это «1д», а не «2д».
  const days = Math.max(1, Math.round(ms / 86_400_000))
  if (days < 30) return { text: `${days}д`, tone: 'later' }

  const months = Math.round(days / 30)
  if (months < 12) return { text: `${months}мес`, tone: 'later' }
  return { text: `${Math.round(months / 12)}г`, tone: 'later' }
}

/** Русское склонение: 1 карточка / 2 карточки / 5 карточек. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
