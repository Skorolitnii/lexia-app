import type {
  CardRow,
  FolderRow,
  NoteRow,
  ReviewLogRow,
  SettingsRow,
} from "@/types";
import { State } from "ts-fsrs";
import { buildCardsForNote, directionsFor } from "@/data/fsrs";
import type { NotePageQuery, Repository } from "@/data/repo";
import { compareNotesByFront, matchesNoteQuery } from "@/data/noteFilter";
import { normalizeStudyLanguage } from "@/speech/languages";

const DB_NAME = "lexia";
const DB_VERSION = 1;
const STORES = [
  "folders",
  "notes",
  "cards",
  "review_logs",
  "settings",
] as const;
type StoreName = (typeof STORES)[number];

/** Один локальный пользователь в мок-режиме; позже - auth.uid() из Supabase. */
export const LOCAL_USER_ID = "local-user";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          const keyPath = store === "settings" ? "user_id" : "id";
          db.createObjectStore(store, { keyPath });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Другая вкладка запросила апгрейд/удаление - закрываем соединение,
      // иначе её запрос повиснет в состоянии `blocked`.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // Апгрейд не может начаться, пока открыта старая вкладка.
    req.onblocked = () =>
      reject(new Error("IndexedDB заблокирована другой вкладкой приложения"));
  });
}

function tx<T>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  run: (os: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAll<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  return tx<T[]>(db, store, "readonly", (os) => os.getAll());
}

async function get<T>(
  db: IDBDatabase,
  store: StoreName,
  key: string,
): Promise<T | undefined> {
  return tx<T | undefined>(db, store, "readonly", (os) => os.get(key));
}

async function put<T>(
  db: IDBDatabase,
  store: StoreName,
  value: T,
): Promise<void> {
  await tx(db, store, "readwrite", (os) => os.put(value));
}

/**
 * Записать несколько строк (возможно в разные store) одной транзакцией -
 * иначе падение между put'ами оставит заметку без карточек или оценку
 * без строки журнала.
 */
function putAll(
  db: IDBDatabase,
  writes: { store: StoreName; value: unknown }[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stores = [...new Set(writes.map((w) => w.store))];
    const t = db.transaction(stores, "readwrite");
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
    for (const { store, value } of writes) t.objectStore(store).put(value);
  });
}

const now = () => new Date().toISOString();

export class IdbRepository implements Repository {
  constructor(private db: IDBDatabase) {}

  static async open(): Promise<IdbRepository> {
    return new IdbRepository(await openDb());
  }

  async listFolders(): Promise<FolderRow[]> {
    const rows = await getAll<FolderRow>(this.db, "folders");
    return rows
      .filter((r) => !r.deleted)
      .sort((a, b) => a.position - b.position);
  }

  async listNotes(): Promise<NoteRow[]> {
    const rows = await getAll<NoteRow>(this.db, "notes");
    return rows.filter((r) => !r.deleted);
  }

  async listCards(): Promise<CardRow[]> {
    const rows = await getAll<CardRow>(this.db, "cards");
    return rows.filter((r) => !r.deleted);
  }

  async listNotesPage(query: NotePageQuery): Promise<NoteRow[]> {
    // IDB не умеет фильтровать/сортировать по произвольным полям, поэтому
    // читаем все живые заметки и режем в памяти. Для локального (одноустройного)
    // датасета это дёшево; серверная реализация делает то же на стороне БД.
    const rows = (await getAll<NoteRow>(this.db, "notes"))
      .filter((r) => !r.deleted)
      .filter((r) => query.folderId === null || r.folder_id === query.folderId)
      .filter((r) => matchesNoteQuery(r, query))
      .sort(compareNotesByFront);
    return rows.slice(query.offset, query.offset + query.limit);
  }

  async folderNoteCounts(): Promise<
    { folderId: string | null; count: number }[]
  > {
    const notes = (await getAll<NoteRow>(this.db, "notes")).filter(
      (r) => !r.deleted,
    );
    const byFolder = new Map<string | null, number>();
    for (const n of notes)
      byFolder.set(n.folder_id, (byFolder.get(n.folder_id) ?? 0) + 1);
    // «Все слова» = сумма по всем папкам (включая заметки без папки).
    const out: { folderId: string | null; count: number }[] = [
      { folderId: null, count: notes.length },
    ];
    for (const [folderId, count] of byFolder) {
      if (folderId !== null) out.push({ folderId, count });
    }
    return out;
  }

  async listCardsForNotes(noteIds: string[]): Promise<CardRow[]> {
    if (noteIds.length === 0) return [];
    const ids = new Set(noteIds);
    return (await getAll<CardRow>(this.db, "cards")).filter(
      (c) => !c.deleted && ids.has(c.note_id),
    );
  }

  async listReviewLogs(): Promise<ReviewLogRow[]> {
    return getAll<ReviewLogRow>(this.db, "review_logs");
  }

  async createNote(
    input: Omit<NoteRow, "user_id" | "created_at" | "updated_at" | "deleted">,
  ): Promise<NoteRow> {
    const ts = now();
    const note: NoteRow = {
      ...input,
      user_id: LOCAL_USER_ID,
      created_at: ts,
      updated_at: ts,
      deleted: false,
    };
    await putAll(this.db, [
      { store: "notes", value: note },
      ...buildCardsForNote(note).map((card) => ({
        store: "cards" as const,
        value: { ...card, user_id: LOCAL_USER_ID } satisfies CardRow,
      })),
    ]);
    return note;
  }

  async updateNote(id: string, patch: Partial<NoteRow>): Promise<NoteRow> {
    const prev = await get<NoteRow>(this.db, "notes", id);
    if (!prev) throw new Error(`note ${id} not found`);
    const next: NoteRow = { ...prev, ...patch, id, updated_at: now() };
    await put(this.db, "notes", next);

    const typeChanged = patch.type !== undefined && patch.type !== prev.type;
    const reverseChanged =
      patch.reverse !== undefined && patch.reverse !== prev.reverse;
    if (typeChanged || reverseChanged) {
      await this.syncCards(next);
    }
    return next;
  }

  /**
   * Привести набор карточек заметки к её текущим type/reverse (§3).
   * Нужные направления оживляются, лишние - мягко удаляются.
   *
   * Смена типа basic↔cloze меняет направление, а вместе с ним и сам навык,
   * поэтому FSRS-состояние старой карточки не переносится: она удаляется,
   * а карточка нового направления заводится с нуля.
   */
  private async syncCards(note: NoteRow): Promise<void> {
    const wanted = new Set(directionsFor(note));
    const cards = (await getAll<CardRow>(this.db, "cards")).filter(
      (c) => c.note_id === note.id,
    );

    const writes: { store: StoreName; value: CardRow }[] = [];

    for (const direction of wanted) {
      if (cards.some((c) => c.direction === direction && !c.deleted)) continue;
      // В SQL-схеме стоит unique (note_id, direction): вставить вторую строку
      // того же направления нельзя, поэтому soft-deleted карточку реанимируем
      // по месту - тот же id, состояние FSRS сбрасывается «с нуля».
      const buried = cards.find((c) => c.direction === direction && c.deleted);
      const [fresh] = buildCardsForNote({
        ...note,
        type: "basic",
        reverse: false,
      });
      writes.push({
        store: "cards",
        value: {
          ...fresh!,
          id: buried?.id ?? fresh!.id,
          created_at: buried?.created_at ?? fresh!.created_at,
          direction,
          user_id: LOCAL_USER_ID,
        },
      });
    }

    for (const card of cards) {
      if (card.deleted || wanted.has(card.direction)) continue;
      writes.push({
        store: "cards",
        value: { ...card, deleted: true, updated_at: now() },
      });
    }

    if (writes.length) await putAll(this.db, writes);
  }

  async deleteNote(id: string): Promise<void> {
    const note = await get<NoteRow>(this.db, "notes", id);
    if (!note) return;
    const cards = await getAll<CardRow>(this.db, "cards");
    const ts = now();
    await putAll(this.db, [
      { store: "notes", value: { ...note, deleted: true, updated_at: ts } },
      ...cards
        .filter((c) => c.note_id === id && !c.deleted)
        .map((c) => ({
          store: "cards" as const,
          value: { ...c, deleted: true, updated_at: ts },
        })),
    ]);
  }

  async createFolder(
    input: Omit<FolderRow, "user_id" | "created_at" | "updated_at" | "deleted">,
  ): Promise<FolderRow> {
    const ts = now();
    const folder: FolderRow = {
      ...input,
      user_id: LOCAL_USER_ID,
      created_at: ts,
      updated_at: ts,
      deleted: false,
    };
    await put(this.db, "folders", folder);
    return folder;
  }

  async updateFolder(
    id: string,
    patch: Partial<FolderRow>,
  ): Promise<FolderRow> {
    const prev = await get<FolderRow>(this.db, "folders", id);
    if (!prev) throw new Error(`folder ${id} not found`);
    const next: FolderRow = { ...prev, ...patch, id, updated_at: now() };
    await put(this.db, "folders", next);
    return next;
  }

  async deleteFolder(id: string, withNotes = false): Promise<void> {
    const folder = await get<FolderRow>(this.db, "folders", id);
    if (!folder) return;
    const notes = await getAll<NoteRow>(this.db, "notes");
    const ts = now();
    const folderNotes = notes.filter((n) => n.folder_id === id && !n.deleted);

    if (!withNotes) {
      // Слова не удаляются вместе с папкой (§3 `folder_id on delete set null`):
      // обнуляем их `folder_id`, иначе они бы указывали на удалённую папку.
      // Мягкое удаление папки не запускает FK-каскад, поэтому чистим руками -
      // и в одной транзакции с самой папкой.
      await putAll(this.db, [
        {
          store: "folders",
          value: { ...folder, deleted: true, updated_at: ts },
        },
        ...folderNotes.map((n) => ({
          store: "notes" as const,
          value: { ...n, folder_id: null, updated_at: ts },
        })),
      ]);
      return;
    }

    // Со словами: мягко гасим и заметки папки, и их карточки (как `deleteNote`),
    // всё в одной транзакции с папкой.
    const noteIds = new Set(folderNotes.map((n) => n.id));
    const cards = await getAll<CardRow>(this.db, "cards");
    await putAll(this.db, [
      { store: "folders", value: { ...folder, deleted: true, updated_at: ts } },
      ...folderNotes.map((n) => ({
        store: "notes" as const,
        value: { ...n, deleted: true, updated_at: ts },
      })),
      ...cards
        .filter((c) => noteIds.has(c.note_id) && !c.deleted)
        .map((c) => ({
          store: "cards" as const,
          value: { ...c, deleted: true, updated_at: ts },
        })),
    ]);
  }

  async applyCardPatch(
    cardId: string,
    patch: Partial<CardRow>,
    log?: Omit<ReviewLogRow, "user_id" | "created_at">,
  ): Promise<CardRow> {
    const prev = await get<CardRow>(this.db, "cards", cardId);
    if (!prev) throw new Error(`card ${cardId} not found`);
    const next: CardRow = { ...prev, ...patch, id: cardId, updated_at: now() };
    await putAll(this.db, [
      { store: "cards", value: next },
      ...(log
        ? [
            {
              store: "review_logs" as const,
              value: {
                ...log,
                user_id: LOCAL_USER_ID,
                created_at: now(),
              } satisfies ReviewLogRow,
            },
          ]
        : []),
    ]);
    return next;
  }

  async undoReview(card: CardRow, logId: string): Promise<void> {
    // Откат карточки и удаление лога - одной транзакцией, иначе половинчатый
    // undo оставит журнал и состояние карточки рассинхронизированными.
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(["cards", "review_logs"], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
      t.objectStore("cards").put({ ...card, updated_at: now() });
      t.objectStore("review_logs").delete(logId);
    });
  }

  async countNewCardsIntroduced(now = new Date()): Promise<number> {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const logs = await getAll<ReviewLogRow>(this.db, "review_logs");
    // `log.state` - состояние ДО оценки, поэтому State.New помечает первый
    // в жизни показ карточки. Считаем уникальные карточки: серия Again в один
    // день даёт несколько строк журнала, но новая карточка всё равно одна.
    const introduced = new Set(
      logs
        .filter(
          (l) =>
            l.state === State.New &&
            new Date(l.review).getTime() >= start.getTime(),
        )
        .map((l) => l.card_id),
    );
    return introduced.size;
  }

  async getSettings(): Promise<SettingsRow> {
    const existing = await get<SettingsRow>(this.db, "settings", LOCAL_USER_ID);
    // У записи, сохранённой до появления поля, облака нет - это `true`
    // (значение по умолчанию), а не `undefined`: иначе переключатель в
    // настройках показал бы выключенное облако, хотя оно работает.
    if (existing) {
      return {
        ...existing,
        tts_cloud: existing.tts_cloud ?? true,
        study_language: normalizeStudyLanguage(existing.study_language),
        tts_voices: existing.tts_voices ?? {},
      };
    }
    const defaults: SettingsRow = {
      user_id: LOCAL_USER_ID,
      display_name: null,
      new_cards_per_day: 20,
      bury_siblings: false,
      tts_voice: null,
      tts_voices: {},
      tts_rate: 1.0,
      tts_autoplay: false,
      audio_region: "us",
      study_language: "en",
      tts_cloud: true,
      updated_at: now(),
    };
    await put(this.db, "settings", defaults);
    return defaults;
  }

  async updateSettings(patch: Partial<SettingsRow>): Promise<SettingsRow> {
    const prev = await this.getSettings();
    const next: SettingsRow = {
      ...prev,
      ...patch,
      user_id: LOCAL_USER_ID,
      updated_at: now(),
    };
    await put(this.db, "settings", next);
    return next;
  }

  async createNotes(
    inputs: Omit<
      NoteRow,
      "user_id" | "created_at" | "updated_at" | "deleted"
    >[],
  ): Promise<NoteRow[]> {
    const ts = now();
    const notes: NoteRow[] = inputs.map((input) => ({
      ...input,
      user_id: LOCAL_USER_ID,
      created_at: ts,
      updated_at: ts,
      deleted: false,
    }));
    await putAll(this.db, [
      ...notes.map((value) => ({ store: "notes" as const, value })),
      ...notes.flatMap((note) =>
        buildCardsForNote(note).map((card) => ({
          store: "cards" as const,
          value: { ...card, user_id: LOCAL_USER_ID } satisfies CardRow,
        })),
      ),
    ]);
    return notes;
  }

  async exportAll() {
    // Без фильтра `deleted` - бэкап обязан быть точным слепком базы.
    const [folders, notes, cards, review_logs] = await Promise.all([
      getAll<FolderRow>(this.db, "folders"),
      getAll<NoteRow>(this.db, "notes"),
      getAll<CardRow>(this.db, "cards"),
      getAll<ReviewLogRow>(this.db, "review_logs"),
    ]);
    const settings = await get<SettingsRow>(this.db, "settings", LOCAL_USER_ID);
    return { folders, notes, cards, review_logs, settings: settings ?? null };
  }

  async replaceAll(data: {
    folders: FolderRow[];
    notes: NoteRow[];
    cards: CardRow[];
    review_logs: ReviewLogRow[];
    settings: SettingsRow | null;
  }): Promise<void> {
    // Очистка и запись - одной транзакцией: обрыв посередине оставил бы
    // пользователя без старых данных и без новых.
    return new Promise((resolve, reject) => {
      const t = this.db.transaction([...STORES], "readwrite");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);

      for (const store of STORES) t.objectStore(store).clear();

      const own = <T extends { user_id?: string }>(row: T) => ({
        ...row,
        user_id: LOCAL_USER_ID,
      });
      for (const row of data.folders) t.objectStore("folders").put(own(row));
      for (const row of data.notes) t.objectStore("notes").put(own(row));
      for (const row of data.cards) t.objectStore("cards").put(own(row));
      for (const row of data.review_logs)
        t.objectStore("review_logs").put(own(row));
      if (data.settings) t.objectStore("settings").put(own(data.settings));
    });
  }

  /** Пуста ли БД (используется для одноразового засева стартовой колоды). */
  async isEmpty(): Promise<boolean> {
    const notes = await getAll<NoteRow>(this.db, "notes");
    return notes.length === 0;
  }
}
