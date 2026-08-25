/**
 * Инициалы для аватара аккаунта. Имени у пользователя нет (поле убрано,
 * см. handoff), поэтому единственный источник - email: `anna.k@mail.com` → «АК»,
 * `otter@mail.com` → «OT».
 */
export function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return local.slice(0, 2).toUpperCase() || '?'
}
