/**
 * Грубая проверка формы адреса: есть имя, «собака», домен с точкой и без пробелов.
 * Полную валидацию по RFC регуляркой не сделать, а строгие шаблоны режут живые
 * адреса - поэтому здесь только отсев явных опечаток. Настоящая проверка одна:
 * дошло письмо или нет.
 *
 * Живёт отдельно от `AccountPanel.tsx`: экспорт не-компонента из файла
 * с компонентами ломает Fast Refresh (ловил линтер).
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

/**
 * Ошибки Auth приходят по-английски, а интерфейс русский. Переводим только те
 * случаи, в которые реально упираешься; остальное показываем как есть -
 * выдумывать перевод неизвестной ошибки хуже, чем показать оригинал.
 */
export function authErrorMessage(error: { status?: number; message: string }): string {
  const text = String(error.message ?? '').trim()
  if (error.status === 429) {
    // Два разных лимита с РАЗНЫМИ текстами (проверено живыми запросами):
    // проектный лимит писем в час - «email rate limit exceeded», без числа;
    // защита от частых повторов - «...after 47 seconds», с числом. Секунды
    // берём из текста, а не зашиваем константу: лимит настраивается в проекте.
    const seconds = /after (\d+) seconds?/.exec(text)?.[1]
    return seconds
      ? `Письмо уже отправлено. Следующее можно запросить через ${seconds} с - проверьте папку «Спам».`
      : 'Лимит писем исчерпан. Подождите и проверьте папку «Спам» - предыдущее письмо, скорее всего, дошло.'
  }
  const lower = text.toLowerCase()
  if (lower.includes('invalid')) {
    return 'Supabase не принял этот адрес'
  }
  if (
    !text ||
    text === '{}' ||
    lower.includes('error sending confirmation email') ||
    lower.includes('email provider')
  ) {
    return 'Не удалось отправить письмо. Проверьте SMTP в Supabase: host, port, login, SMTP key и подтверждённый sender email.'
  }
  return `Не отправилось: ${text}`
}

/**
 * Ошибки проверки кода - отдельно от `authErrorMessage`: там «invalid» значит
 * «плохой адрес», а здесь ровно наоборот - «плохой код», и общий текст ввёл бы
 * в заблуждение. Просроченный и неверный код Supabase отдаёт ОДНОЙ ошибкой
 * («Token has expired or is invalid»), различить их нельзя - поэтому и текст
 * один, покрывающий обе причины.
 */
export function otpErrorMessage(error: { status?: number; message: string }): string {
  const text = String(error.message ?? '')
  const lower = text.toLowerCase()
  if (lower.includes('expired') || lower.includes('invalid')) {
    return 'Код неверный или уже истёк. Проверьте последнее письмо или запросите новое.'
  }
  if (error.status === 429) {
    return 'Слишком много попыток. Подождите немного.'
  }
  return `Не получилось войти: ${text}`
}
