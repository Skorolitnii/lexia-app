// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FolderPicker } from '@/library/FolderPicker'
import type { FolderRow } from '@/types'

/**
 * Выбор папки - единственный путь, которым заметка получает папку (она
 * обязательна), и заодно единственное место, где заводится новая папка.
 * Проверяем именно контракт наружу: что уходит в `onPick`/`onCreate`.
 */

function folder(id: string, name: string): FolderRow {
  return {
    id,
    user_id: 'u',
    name,
    color: null,
    position: 0,
    created_at: '',
    updated_at: '',
    deleted: false,
  }
}

const FOLDERS = [folder('f1', 'Животные'), folder('f2', 'Работа')]

/** jsdom не даёт matchMedia; десктоп - чтобы список рисовался выпадашкой. */
function stubMatchMedia(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

/** Обёртка с состоянием - как в NoteForm: выбор отражается на закрытом поле. */
function Harness({ onCreate }: { onCreate?: (name: string) => void }) {
  const [folderId, setFolderId] = useState<string | null>(null)
  return (
    <FolderPicker
      folders={FOLDERS}
      folderId={folderId}
      onPick={setFolderId}
      onCreate={(name) => onCreate?.(name)}
    />
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('FolderPicker', () => {
  it('выбирает существующую папку', async () => {
    stubMatchMedia(true)
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: /Выберите папку/ }))
    await userEvent.click(screen.getByText('Животные'))

    // Список закрылся (не сразу - `AnimatePresence` доигрывает выход),
    // а поле показывает выбранное.
    await waitFor(() => expect(screen.queryByLabelText('Поиск папки')).toBeNull())
    expect(screen.getByRole('button', { name: /Животные/ })).toBeTruthy()
  })

  // Создание отдано отдельному окну (имя + цвет): «строка поиска = имя новой
  // папки» была неочевидной. Пикер лишь просит его открыть.
  it('«+ Новая папка» просит открыть окно создания', async () => {
    stubMatchMedia(true)
    const onCreate = vi.fn()
    render(<Harness onCreate={onCreate} />)

    await userEvent.click(screen.getByRole('button', { name: /Выберите папку/ }))
    await userEvent.click(screen.getByRole('button', { name: '+ Новая папка' }))

    expect(onCreate).toHaveBeenCalledWith('')
    // Список закрылся: окно откроется поверх формы, выпадашка под ним мешала бы.
    await waitFor(() => expect(screen.queryByLabelText('Поиск папки')).toBeNull())
  })

  // Искал, не нашёл, создаёт - набранное не должно пропасть.
  it('отдаёт набранный запрос заготовкой имени', async () => {
    stubMatchMedia(true)
    const onCreate = vi.fn()
    render(<Harness onCreate={onCreate} />)

    await userEvent.click(screen.getByRole('button', { name: /Выберите папку/ }))
    await userEvent.type(screen.getByLabelText('Поиск папки'), 'Путешествия')
    await userEvent.click(screen.getByRole('button', { name: /Создать папку «Путешествия»/ }))

    expect(onCreate).toHaveBeenCalledWith('Путешествия')
  })

  it('фильтрует список по запросу', async () => {
    stubMatchMedia(true)
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: /Выберите папку/ }))
    await userEvent.type(screen.getByLabelText('Поиск папки'), 'жив')

    expect(screen.getByText('Животные')).toBeTruthy()
    expect(screen.queryByText('Работа')).toBeNull()
  })

  // На мобайле лист занимает пол-экрана, и поднятая клавиатура накрыла бы
  // список папок - ради которого его и открыли.
  it('на мобайле не фокусирует поиск при открытии', async () => {
    stubMatchMedia(false)
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: /Выберите папку/ }))

    expect(document.activeElement).not.toBe(screen.getByLabelText('Поиск папки'))
  })
})
