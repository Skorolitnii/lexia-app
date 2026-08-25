import { describe, expect, it } from 'vitest'
import { authErrorMessage, looksLikeEmail, otpErrorMessage } from '@/supabase/email'

describe('looksLikeEmail', () => {
  it('пропускает обычные адреса', () => {
    expect(looksLikeEmail('artiom.climenko@gmail.com')).toBe(true)
    expect(looksLikeEmail('a+tag@sub.example.co.uk')).toBe(true)
  })

  it('отсекает явные опечатки', () => {
    expect(looksLikeEmail('')).toBe(false)
    expect(looksLikeEmail('artem')).toBe(false)
    expect(looksLikeEmail('artem@')).toBe(false)
    expect(looksLikeEmail('artem@@bad')).toBe(false)
    // Домен без зоны: частая опечатка, а письмо туда не уйдёт.
    expect(looksLikeEmail('artem@localhost')).toBe(false)
  })

  it('не пропускает пробелы внутри', () => {
    expect(looksLikeEmail('ar tem@mail.ru')).toBe(false)
    expect(looksLikeEmail('artem@ma il.ru')).toBe(false)
  })

  // Проверка нарочно пропускает экзотику: такой адрес валиден по RFC, и
  // отсекать его мы НЕ хотим - задача фильтра только в опечатках. Тест
  // фиксирует это как решение, а не как случайность шаблона.
  it('не режет валидную экзотику', () => {
    expect(looksLikeEmail('"very.unusual"@example.com')).toBe(true)
  })
})

describe('authErrorMessage', () => {
  // Текст получен живым запросом к проекту: два подряд `signInWithOtp`
  // дают именно такой 429, БЕЗ числа секунд.
  it('лимит писем в час - без числа секунд', () => {
    const msg = authErrorMessage({ status: 429, message: 'email rate limit exceeded' })
    expect(msg).toContain('Лимит писем исчерпан')
    expect(msg).not.toContain('undefined')
  })

  it('частый повтор - секунды берутся из текста', () => {
    const msg = authErrorMessage({
      status: 429,
      message: 'For security purposes, you can only request this after 47 seconds.',
    })
    expect(msg).toContain('47 с')
  })

  it('невалидный адрес по мнению сервера', () => {
    expect(
      authErrorMessage({
        status: 400,
        message: 'Unable to validate email address: invalid format',
      }),
    ).toBe('Supabase не принял этот адрес')
  })

  // Незнакомую ошибку не выдумываем, а показываем как есть - иначе
  // диагностировать проблему станет нечем.
  it('незнакомую ошибку показывает как есть', () => {
    expect(authErrorMessage({ status: 500, message: 'Internal server error' })).toBe(
      'Не отправилось: Internal server error',
    )
  })
})

describe('otpErrorMessage', () => {
  // Ровно тот текст, которым Supabase отвечает и на просроченный, и на
  // неверный код - различить причины по ответу нельзя.
  it('просроченный или неверный код - один текст про обе причины', () => {
    const msg = otpErrorMessage({ status: 403, message: 'Token has expired or is invalid' })
    expect(msg).toContain('неверный или уже истёк')
  })

  // Ключевое отличие от authErrorMessage: слово «invalid» здесь про КОД,
  // а не про адрес - текст «Supabase не принял этот адрес» был бы вредным.
  it('не путает неверный код с неверным адресом', () => {
    expect(otpErrorMessage({ status: 403, message: 'Invalid token' })).not.toContain('адрес')
  })

  it('перебор попыток', () => {
    expect(otpErrorMessage({ status: 429, message: 'Too many requests' })).toContain(
      'Слишком много попыток',
    )
  })

  it('незнакомую ошибку показывает как есть', () => {
    expect(otpErrorMessage({ status: 500, message: 'Internal server error' })).toBe(
      'Не получилось войти: Internal server error',
    )
  })
})
