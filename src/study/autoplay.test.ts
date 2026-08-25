import { describe, expect, it } from 'vitest'
import { autoplayText } from '@/study/autoplay'

const CLOZE = 'The fox is a {{cunning::хитрый}} animal.'
const CLOZE_PLAIN = 'The fox is a cunning animal.'

describe('autoplayText', () => {
  it('autoplay выключен - всегда null', () => {
    expect(
      autoplayText({ autoplay: false, direction: 'forward', front: 'otter', revealed: false }),
    ).toBeNull()
    expect(
      autoplayText({ autoplay: false, direction: 'cloze', front: CLOZE, revealed: true }),
    ).toBeNull()
  })

  it('forward: озвучиваем EN-слово на ЛИЦЕ, но не на обороте', () => {
    expect(
      autoplayText({ autoplay: true, direction: 'forward', front: 'otter', revealed: false }),
    ).toBe('otter')
    // На обороте forward уже не переигрываем (иначе повтор при reveal).
    expect(
      autoplayText({ autoplay: true, direction: 'forward', front: 'otter', revealed: true }),
    ).toBeNull()
  })

  it('cloze: на ЛИЦЕ молчим (иначе выдаст ответ), на ОБОРОТЕ - предложение целиком', () => {
    // Ключевой баг: на лице cloze НЕ должен звучать.
    expect(
      autoplayText({ autoplay: true, direction: 'cloze', front: CLOZE, revealed: false }),
    ).toBeNull()
    // На обороте - предложение с подставленными ответами, без разметки.
    expect(autoplayText({ autoplay: true, direction: 'cloze', front: CLOZE, revealed: true })).toBe(
      CLOZE_PLAIN,
    )
  })

  it('reverse: на ЛИЦЕ молчим (русское слово), на ОБОРОТЕ - EN-слово из front', () => {
    // Лицо reverse русское - озвучивать нечего.
    expect(
      autoplayText({ autoplay: true, direction: 'reverse', front: 'otter', revealed: false }),
    ).toBeNull()
    // EN-слово появляется на обороте - его и играем.
    expect(
      autoplayText({ autoplay: true, direction: 'reverse', front: 'otter', revealed: true }),
    ).toBe('otter')
  })
})
