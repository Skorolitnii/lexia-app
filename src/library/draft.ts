import type { Example, NoteRow } from '@/types'

/** Черновик формы заметки: то, что реально редактируется руками. */
export interface NoteDraft {
  front: string
  back: string
  folder_id: string | null
  type: 'basic' | 'cloze'
  reverse: boolean
  examples: Example[]
  tags: string[]
  details: string
  /** Подтягивается из Datamuse, руками не вводится (§4). */
  transcription: string | null
  audio_url: string | null
  /**
   * Слово, которому принадлежат transcription/audio_url (нормализованное).
   * Нужно, потому что подстановка обновляется только когда словарь ответил,
   * а есть пути, где ответа не будет вовсе: ввели кириллицу, дописали слово
   * до фразы, переключили тип на cloze, сменили слово в офлайне. Без этой
   * привязки чужая транскрипция доживала до сохранения.
   */
  lookupFor: string | null
}

/** Ключ, по которому транскрипция/аудио привязаны к слову. */
export function lookupKey(front: string): string {
  return front.trim().toLowerCase()
}

/**
 * Транскрипция и аудио - только если они принадлежат текущему слову.
 * Единый источник правды и для подсказки в форме, и для сохранения.
 */
export function dictionaryFields(draft: NoteDraft): {
  transcription: string | null
  audio_url: string | null
} {
  const valid = draft.lookupFor !== null && draft.lookupFor === lookupKey(draft.front)
  return valid
    ? { transcription: draft.transcription, audio_url: draft.audio_url }
    : { transcription: null, audio_url: null }
}

export function emptyDraft(folderId: string | null): NoteDraft {
  return {
    front: '',
    back: '',
    folder_id: folderId,
    type: 'basic',
    reverse: false,
    examples: [],
    tags: [],
    details: '',
    transcription: null,
    audio_url: null,
    lookupFor: null,
  }
}

export function draftFromNote(note: NoteRow): NoteDraft {
  return {
    front: note.front,
    back: note.back ?? '',
    folder_id: note.folder_id,
    type: note.type,
    reverse: note.reverse,
    examples: note.examples,
    tags: note.tags,
    details: note.details ?? '',
    transcription: note.transcription,
    audio_url: note.audio_url,
    // Сохранённые значения принадлежат сохранённому слову: пока front не
    // изменили, они валидны и не должны мигать до ответа словаря.
    lookupFor: lookupKey(note.front),
  }
}

/** Сколько карточек породит черновик - те же правила, что в buildCardsForNote (§3). */
export function cardsForDraft(draft: NoteDraft): number {
  if (draft.type === 'cloze') return 1
  return draft.reverse ? 2 : 1
}
