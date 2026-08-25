import type { CardRow, FolderRow, NoteRow, ReviewLogRow, SettingsRow } from '@/types'

/**
 * Слой данных за интерфейсом. Мок-реализация - на IndexedDB; позже
 * подменяется на Legend-State + Supabase без переписывания UI.
 *
 * Все выборки возвращают только `deleted = false`. Удаление - soft delete.
 * Методы async, чтобы граница вызовов не менялась при переходе на синк.
 */
/** Фильтры и окно для постраничного чтения списка заметок (§ библиотека). */
export interface NotePageQuery {
  /** `null` - все папки; иначе id конкретной папки. */
  folderId: string | null
  /** Поиск по `front`/`back`, без учёта регистра; пустая строка - без фильтра. */
  search: string
  type: 'all' | 'basic' | 'cloze'
  /** Сколько строк пропустить (окно = offset..offset+limit). */
  offset: number
  limit: number
}

export interface Repository {
  listFolders(): Promise<FolderRow[]>
  listNotes(): Promise<NoteRow[]>
  listCards(): Promise<CardRow[]>

  /**
   * Одна страница заметок под фильтры `NotePageQuery`, отсортированная по
   * `front` (A→Я). Так библиотека не тянет тысячи строк в память: список
   * читается окнами, фильтр/сортировка/срез - на стороне хранилища.
   *
   * Отдаёт ровно то, что просили: если вернулось меньше `limit`, страниц
   * больше нет. `listNotes` (всё разом) остаётся для изучения, статистики,
   * импорта и бэкапа - там нужен полный набор.
   */
  listNotesPage(query: NotePageQuery): Promise<NoteRow[]>

  /**
   * Количество заметок по папкам - для счётчиков в сайдбаре без чтения самих
   * строк. `folderId: null` - строка «Все слова» (сумма по всем папкам).
   * Заметки без папки (`folder_id = null`) входят только в «Все слова».
   */
  folderNoteCounts(): Promise<{ folderId: string | null; count: number }[]>

  /**
   * Карточки только для заданных заметок - для бейджей срока на загруженной
   * странице. Пустой массив id → пустой результат (без запроса).
   */
  listCardsForNotes(noteIds: string[]): Promise<CardRow[]>

  /**
   * Журнал повторений для статистики (§8 этап 8).
   *
   * Без фильтра `deleted`: у журнала такого поля нет - он append-only (§3).
   * Логи удалённых карточек намеренно остаются: активность за прошлый месяц
   * не должна задним числом обнуляться от того, что слово потом убрали.
   */
  listReviewLogs(): Promise<ReviewLogRow[]>

  /** Создать заметку и породить её карточки (`buildCardsForNote`). */
  createNote(
    note: Omit<NoteRow, 'user_id' | 'created_at' | 'updated_at' | 'deleted'>,
  ): Promise<NoteRow>

  /**
   * Обновить контент заметки. FSRS-состояние карточек не сбрасывается.
   *
   * Смена `type` или `reverse` приводит набор карточек к нужным направлениям:
   * недостающие заводятся с нуля, лишние мягко удаляются, уцелевшие
   * (напр. forward при переключении reverse) не трогаются. Повторное включение
   * направления оживляет ту же строку - в SQL-схеме стоит
   * unique (note_id, direction), второй строки быть не может.
   */
  updateNote(id: string, patch: Partial<NoteRow>): Promise<NoteRow>

  /** Soft-delete заметки и её карточек. */
  deleteNote(id: string): Promise<void>

  /** Soft-delete всех заметок в папке и их карточек, папку оставить. */
  deleteNotesInFolder(folderId: string): Promise<void>

  createFolder(
    folder: Omit<FolderRow, 'user_id' | 'created_at' | 'updated_at' | 'deleted'>,
  ): Promise<FolderRow>
  updateFolder(id: string, patch: Partial<FolderRow>): Promise<FolderRow>
  /**
   * Soft-delete папки. `withNotes = false` (по умолчанию) оставляет слова, лишь
   * обнуляя их `folder_id`; `withNotes = true` мягко удаляет слова папки и их
   * карточки заодно.
   */
  deleteFolder(id: string, withNotes?: boolean): Promise<void>

  /** Обновить карточку (напр. после оценки) и добавить строку в журнал. */
  applyCardPatch(
    cardId: string,
    patch: Partial<CardRow>,
    log?: Omit<ReviewLogRow, 'user_id' | 'created_at'>,
  ): Promise<CardRow>

  /**
   * Undo: вернуть карточку в прежнее состояние и удалить строку журнала.
   * Журнал append-only на сервере, но незакоммиченный локальный откат допустим.
   */
  undoReview(card: CardRow, logId: string): Promise<void>

  /**
   * Сколько новых карточек уже введено с начала суток `now` - чтобы лимит
   * `new_cards_per_day` был дневным, а не «на сессию» (иначе рестарт сессии
   * подтягивал бы следующую порцию новых без ограничений).
   */
  countNewCardsIntroduced(now?: Date): Promise<number>

  getSettings(): Promise<SettingsRow>
  updateSettings(patch: Partial<SettingsRow>): Promise<SettingsRow>

  /**
   * Все строки для бэкапа - ВКЛЮЧАЯ soft-deleted (§5, loseless).
   * Отдельный метод, потому что `list*` намеренно прячут удалённое, а бэкап
   * обязан вернуть базу ровно в прежний вид.
   */
  exportAll(): Promise<{
    folders: FolderRow[]
    notes: NoteRow[]
    cards: CardRow[]
    review_logs: ReviewLogRow[]
    settings: SettingsRow | null
  }>

  /** Заменить всё содержимое базы бэкапом (восстановление). Необратимо. */
  replaceAll(data: {
    folders: FolderRow[]
    notes: NoteRow[]
    cards: CardRow[]
    review_logs: ReviewLogRow[]
    settings: SettingsRow | null
  }): Promise<void>

  /**
   * Массово создать заметки с их карточками - одной транзакцией.
   * Поштучный `createNote` на импорте 50+ заметок дал бы 50+ транзакций,
   * и обрыв на середине оставил бы половину колоды.
   */
  createNotes(
    notes: Omit<NoteRow, 'user_id' | 'created_at' | 'updated_at' | 'deleted'>[],
  ): Promise<NoteRow[]>
}
