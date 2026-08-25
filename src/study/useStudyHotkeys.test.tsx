// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Rating, type Grade } from 'ts-fsrs'
import { useStudyHotkeys } from '@/study/useStudyHotkeys'

// Нет `globals: true` - cleanup вручную, иначе слушатели прошлого теста
// остаются на window и ловят нажатия следующего.
afterEach(cleanup)

function setup(cram: boolean) {
  const rate = vi.fn<(g: Grade) => void>()
  function Harness() {
    useStudyHotkeys({
      revealed: true,
      reveal: () => {},
      rate,
      undo: () => {},
      exit: () => {},
      enabled: true,
      cram,
    })
    return null
  }
  render(<Harness />)
  return rate
}

// Диспатчим на body, а не на window: хук смотрит `e.target.closest(...)`, и у
// window такого метода нет - настоящее нажатие всегда прилетает от элемента.
const press = (key: string) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

describe('useStudyHotkeys: оценки', () => {
  it('повторение - все четыре градации на 1-4', () => {
    const rate = setup(false)
    for (const k of ['1', '2', '3', '4']) press(k)
    expect(rate.mock.calls.map(([g]) => g)).toEqual([
      Rating.Again,
      Rating.Hard,
      Rating.Good,
      Rating.Easy,
    ])
  })

  it('тренировка - только 1 «Ещё раз» и 2 «Дальше»', () => {
    const rate = setup(true)
    press('1')
    press('2')
    expect(rate.mock.calls.map(([g]) => g)).toEqual([Rating.Again, Rating.Good])
  })

  it('тренировка - 3 и 4 не делают ничего: таких кнопок на экране нет', () => {
    const rate = setup(true)
    press('3')
    press('4')
    expect(rate).not.toHaveBeenCalled()
  })
})
