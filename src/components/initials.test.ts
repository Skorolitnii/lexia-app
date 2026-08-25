import { describe, expect, it } from 'vitest'
import { initialsFromEmail } from '@/components/initials'

describe('initialsFromEmail', () => {
  it('составные локальные части дают две буквы', () => {
    expect(initialsFromEmail('anna.klimenko@mail.com')).toBe('AK')
    expect(initialsFromEmail('anna_k@mail.com')).toBe('AK')
    expect(initialsFromEmail('anna-k@mail.com')).toBe('AK')
  })

  it('простой адрес - первые две буквы', () => {
    expect(initialsFromEmail('otter@mail.com')).toBe('OT')
  })

  it('односимвольный адрес не падает', () => {
    expect(initialsFromEmail('a@mail.com')).toBe('A')
  })

  it('без локальной части - заглушка вместо пустоты', () => {
    expect(initialsFromEmail('@mail.com')).toBe('?')
  })
})
