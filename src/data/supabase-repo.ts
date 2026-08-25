import type { SupabaseClient } from "@supabase/supabase-js";
import { State } from "ts-fsrs";
import { buildCardsForNote, directionsFor } from "@/data/fsrs";
import type { NotePageQuery, Repository } from "@/data/repo";
import { normalizeStudyLanguage } from "@/speech/languages";
import type {
  CardRow,
  FolderRow,
  NoteRow,
  ReviewLogRow,
  SettingsRow,
} from "@/types";

/**
 * PostgREST режет ответ на `max_rows` (в конфиге проекта - 1000) МОЛЧА: ошибки
 * нет, просто приходит меньше строк. Для журнала повторений это несколько
 * месяцев учёбы, после которых статистика начала бы врать, а «loseless»-бэкап
 * молча терять хвост. Поэтому читаем страницами до конца.
 */
const PAGE = 1000;

async function selectAll<T>(
  build: () => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  },
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    // Неполная страница - значит конец: лишний запрос не нужен.
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * Убрать временные метки перед отправкой: ими владеет сервер (§3).
 *
 * `buildCardsForNote` проставляет их для локального хранилища, где сервера нет.
 * На сервере `created_at` ставит дефолт колонки, `updated_at` - триггер; браузер
 * с его возможным расхождением часов сюда лезть не должен.
 */
function stripServerTimes<
  T extends { created_at?: string; updated_at?: string },
>(row: T) {
  const rest = { ...row };
  delete rest.created_at;
  delete rest.updated_at;
  return rest;
}

/**
 * Та же `Repository`, но поверх Supabase вместо IndexedDB.
 *
 * Отход от §8 этапа 3 (зафиксирован): Legend-State + `syncedSupabase` не берём -
 * 3.0 всё ещё бета (48-я подряд), а UI уже написан под async-методы этого
 * интерфейса. Подмена реализации не трогает ни один из семи потребителей.
 *
 * `user_id` нигде не проставляется: в схеме у него `default auth.uid()`, и
 * RLS всё равно не даст записать чужой. Слать его из браузера - лишний способ
 * ошибиться.
 *
 * Главное отличие от IDB-версии: транзакций между запросами тут нет. Там, где
 * IDB писала несколько store одной транзакцией, здесь порядок записи выбран так,
 * чтобы обрыв посередине оставлял базу в чинимом виде, а не в противоречивом.
 */
export class SupabaseRepository implements Repository {
  constructor(private db: SupabaseClient) {}

  /** Развернуть ответ PostgREST: данные или внятная ошибка. */
  private static unwrap<T>(res: {
    data: T | null;
    error: { message: string } | null;
  }): T {
    if (res.error) throw new Error(res.error.message);
    if (res.data === null) throw new Error("Supabase вернул пустой ответ");
    return res.data;
  }

  async listFolders(): Promise<FolderRow[]> {
    return SupabaseRepository.unwrap(
      await this.db
        .from("folders")
        .select("*")
        .eq("deleted", false)
        .order("position"),
    );
  }

  async listNotes(): Promise<NoteRow[]> {
    return selectAll<NoteRow>(() =>
      this.db.from("notes").select("*").eq("deleted", false),
    );
  }

  async listCards(): Promise<CardRow[]> {
    // Карточек вдвое больше заметок (обратные), лимит достигается раньше всего.
    return selectAll<CardRow>(() =>
      this.db.from("cards").select("*").eq("deleted", false),
    );
  }

  async listNotesPage(query: NotePageQuery): Promise<NoteRow[]> {
    let q = this.db.from("notes").select("*").eq("deleted", false);
    // `is`, а не `eq`: folder_id null сравнивается через IS NULL.
    q = query.folderId === null ? q : q.eq("folder_id", query.folderId);
    if (query.type !== "all") q = q.eq("type", query.type);
    const search = query.search.trim();
    if (search) {
      // ilike нечувствителен к регистру; спецсимволы PostgREST (`,`/`%`) в
      // поиске экранируем, иначе запятая разорвала бы список условий `or`.
      const esc = search.replace(/([%,])/g, "\\$1");
      q = q.or(`front.ilike.%${esc}%,back.ilike.%${esc}%`);
    }
    // Сортировка и окно - на сервере: в память приезжает ровно одна страница.
    return SupabaseRepository.unwrap(
      await q
        .order("front")
        .range(query.offset, query.offset + query.limit - 1),
    ) as NoteRow[];
  }

  async folderNoteCounts(): Promise<
    { folderId: string | null; count: number }[]
  > {
    // `head: true` + `count: 'exact'`: сервер считает строки и не шлёт их тела.
    // Один запрос на «все слова» и по одному на каждую папку - счётчиков в
    // сайдбаре немного, а строки не читаются вовсе.
    const all = await this.db
      .from("notes")
      .select("folder_id", { count: "exact", head: true })
      .eq("deleted", false);
    if (all.error) throw new Error(all.error.message);
    const out: { folderId: string | null; count: number }[] = [
      { folderId: null, count: all.count ?? 0 },
    ];

    const folders = await this.listFolders();
    const perFolder = await Promise.all(
      folders.map(async (f) => {
        const res = await this.db
          .from("notes")
          .select("id", { count: "exact", head: true })
          .eq("deleted", false)
          .eq("folder_id", f.id);
        if (res.error) throw new Error(res.error.message);
        return { folderId: f.id as string | null, count: res.count ?? 0 };
      }),
    );
    return [...out, ...perFolder];
  }

  async listCardsForNotes(noteIds: string[]): Promise<CardRow[]> {
    if (noteIds.length === 0) return [];
    // Карточек для страницы заметок мало (1–2 на заметку), но подстрахуемся
    // постраничным чтением на случай очень большой страницы.
    return selectAll<CardRow>(() =>
      this.db
        .from("cards")
        .select("*")
        .eq("deleted", false)
        .in("note_id", noteIds),
    );
  }

  async listReviewLogs(): Promise<ReviewLogRow[]> {
    // Без фильтра `deleted`: журнал append-only, поля нет (§3).
    // Растёт быстрее всех таблиц - постранично обязательно.
    return selectAll<ReviewLogRow>(() =>
      this.db.from("review_logs").select("*"),
    );
  }

  async createNote(
    input: Omit<NoteRow, "user_id" | "created_at" | "updated_at" | "deleted">,
  ): Promise<NoteRow> {
    const [note] = await this.createNotes([input]);
    return note!;
  }

  async createNotes(
    inputs: Omit<
      NoteRow,
      "user_id" | "created_at" | "updated_at" | "deleted"
    >[],
  ): Promise<NoteRow[]> {
    if (inputs.length === 0) return [];
    // Заметки - одним запросом, карточки - вторым. Одной транзакции на два
    // запроса PostgREST не даёт: при обрыве между ними останутся заметки без
    // карточек. Это чинится повторным сохранением заметки, а обратный порядок
    // (карточки раньше заметок) упал бы на внешнем ключе note_id.
    const notes = SupabaseRepository.unwrap(
      await this.db.from("notes").insert(inputs).select("*"),
    ) as NoteRow[];

    // Время снимаем: `buildCardsForNote` ставит его для локального хранилища,
    // а здесь им владеет сервер - иначе часы браузера попадают в created_at.
    const cards = notes.flatMap((note) =>
      buildCardsForNote(note).map(stripServerTimes),
    );
    if (cards.length) {
      const { error } = await this.db.from("cards").insert(cards);
      if (error) throw new Error(error.message);
    }
    return notes;
  }

  async updateNote(id: string, patch: Partial<NoteRow>): Promise<NoteRow> {
    const prev = SupabaseRepository.unwrap(
      await this.db.from("notes").select("*").eq("id", id).single(),
    ) as NoteRow;

    // `updated_at` не шлём - им владеет серверный триггер (§3, иначе
    // расхождение часов между устройствами ломает инкрементальный синк).
    const next = SupabaseRepository.unwrap(
      await this.db
        .from("notes")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single(),
    ) as NoteRow;

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
   *
   * Повторно включённое направление оживляет ту же строку: в схеме стоит
   * unique (note_id, direction), вставить вторую нельзя. FSRS-состояние при
   * этом сбрасывается с нуля - навык другой, переносить его нечестно.
   */
  private async syncCards(note: NoteRow): Promise<void> {
    const wanted = directionsFor(note);
    const existing = SupabaseRepository.unwrap(
      await this.db.from("cards").select("*").eq("note_id", note.id),
    ) as CardRow[];

    for (const direction of wanted) {
      if (existing.some((c) => c.direction === direction && !c.deleted))
        continue;
      const buried = existing.find((c) => c.direction === direction);
      const [fresh] = buildCardsForNote({
        ...note,
        type: "basic",
        reverse: false,
      });
      // Временем владеет сервер (§3): created_at ставит дефолт при вставке,
      // updated_at - триггер. Оживляемой карточке created_at особенно важно не
      // трогать: FSRS-состояние сбрасывается намеренно (навык другой), но дата
      // появления карточки к состоянию не относится и должна остаться прежней.
      const row = stripServerTimes({ ...fresh!, direction });
      const { error } = buried
        ? // id задан фильтром, в теле он лишний.
          await this.db.from("cards").update(row).eq("id", buried.id)
        : await this.db.from("cards").insert(row);
      if (error) throw new Error(error.message);
    }

    const extra = existing
      .filter((c) => !c.deleted && !wanted.includes(c.direction))
      .map((c) => c.id);
    if (extra.length) {
      const { error } = await this.db
        .from("cards")
        .update({ deleted: true })
        .in("id", extra);
      if (error) throw new Error(error.message);
    }
  }

  async deleteNote(id: string): Promise<void> {
    // Сначала карточки, потом заметка: обрыв между запросами оставит заметку
    // без карточек (её видно и можно удалить снова), а не осиротевшие карточки
    // в очереди изучения - те всплыли бы как «карточка без заметки».
    const cards = await this.db
      .from("cards")
      .update({ deleted: true })
      .eq("note_id", id);
    if (cards.error) throw new Error(cards.error.message);
    const note = await this.db
      .from("notes")
      .update({ deleted: true })
      .eq("id", id);
    if (note.error) throw new Error(note.error.message);
  }

  async createFolder(
    input: Omit<FolderRow, "user_id" | "created_at" | "updated_at" | "deleted">,
  ): Promise<FolderRow> {
    return SupabaseRepository.unwrap(
      await this.db.from("folders").insert(input).select("*").single(),
    );
  }

  async updateFolder(
    id: string,
    patch: Partial<FolderRow>,
  ): Promise<FolderRow> {
    return SupabaseRepository.unwrap(
      await this.db
        .from("folders")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single(),
    );
  }

  async deleteFolder(id: string, withNotes = false): Promise<void> {
    if (withNotes) {
      // Со словами: сначала карточки слов папки, потом сами слова, потом папка.
      // Порядок как в `deleteNote` (карточки → заметки): обрыв не оставит
      // осиротевшие карточки в очереди. Карточки выбираем подзапросом по
      // note_id слов папки - на сервере это делает PostgREST `in`.
      const noteRows = await this.db
        .from("notes")
        .select("id")
        .eq("folder_id", id);
      if (noteRows.error) throw new Error(noteRows.error.message);
      const noteIds = (noteRows.data ?? []).map((n) => n.id);
      if (noteIds.length > 0) {
        const cards = await this.db
          .from("cards")
          .update({ deleted: true })
          .in("note_id", noteIds);
        if (cards.error) throw new Error(cards.error.message);
      }
      const notes = await this.db
        .from("notes")
        .update({ deleted: true })
        .eq("folder_id", id);
      if (notes.error) throw new Error(notes.error.message);
      const { error } = await this.db
        .from("folders")
        .update({ deleted: true })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return;
    }

    // Слова остаются, но без папки (§3 `on delete set null`). Мягкое удаление
    // папки FK-каскад не запускает, поэтому обнуляем `folder_id` сами. Порядок
    // (сначала слова, потом папка) выбран как везде на сервере: обрыв между
    // запросами не оставит слово, указывающее на исчезнувшую папку.
    const notes = await this.db
      .from("notes")
      .update({ folder_id: null })
      .eq("folder_id", id);
    if (notes.error) throw new Error(notes.error.message);
    const { error } = await this.db
      .from("folders")
      .update({ deleted: true })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async applyCardPatch(
    cardId: string,
    patch: Partial<CardRow>,
    log?: Omit<ReviewLogRow, "user_id" | "created_at">,
  ): Promise<CardRow> {
    // Карточка раньше журнала: журнал - производное, по нему считается только
    // статистика. Лишняя строка журнала без сдвига карточки исказила бы график
    // сильнее, чем сдвинутая карточка без строки.
    const next = SupabaseRepository.unwrap(
      await this.db
        .from("cards")
        .update(patch)
        .eq("id", cardId)
        .select("*")
        .single(),
    ) as CardRow;

    if (log) {
      const { error } = await this.db.from("review_logs").insert(log);
      if (error) throw new Error(error.message);
    }
    return next;
  }

  async undoReview(card: CardRow, logId: string): Promise<void> {
    // На сервере журнал append-only: RLS даёт только select и insert, delete-
    // политики нет вовсе. Поэтому строку не удаляем - она остаётся честной
    // записью «оценка была и была отменена», а карточка возвращается в прежнее
    // состояние. Локально IDB строку удаляла; расхождение осознанное, править
    // политику ради undo не хочется.
    // `logId` не используется намеренно, а не по забывчивости: параметр задан
    // сигнатурой `Repository`, и локальная реализация им пользуется.
    void logId;
    const { error } = await this.db
      .from("cards")
      .update(card)
      .eq("id", card.id);
    if (error) throw new Error(error.message);
  }

  async countNewCardsIntroduced(now = new Date()): Promise<number> {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    // `state` - состояние ДО оценки, поэтому State.New помечает первый показ.
    // Считаем уникальные карточки: серия Again в один день даёт несколько
    // строк, но новая карточка всё равно одна.
    const logs = SupabaseRepository.unwrap(
      await this.db
        .from("review_logs")
        .select("card_id")
        .eq("state", State.New)
        .gte("review", start.toISOString()),
    ) as { card_id: string }[];
    return new Set(logs.map((l) => l.card_id)).size;
  }

  async getSettings(): Promise<SettingsRow> {
    // Строку заводит триггер `on_auth_user_created` (миграция 0002), поэтому
    // здесь её только читаем. `maybeSingle`, а не `single`: если триггер по
    // какой-то причине не сработал, нужна внятная ошибка, а не пустой ответ.
    //
    // `unwrap` здесь не годится: для него `data === null` - аварийный случай,
    // а у `maybeSingle` это законный ответ «строки нет». Разбираем вручную,
    // иначе своё понятное сообщение подменяется чужим невнятным.
    const res = await this.db.from("settings").select("*").maybeSingle();
    if (res.error) throw new Error(res.error.message);
    const row = res.data as SettingsRow | null;
    if (!row) {
      throw new Error(
        "Нет строки настроек: не сработал триггер on_auth_user_created. " +
          "Проверьте, что миграция применена (supabase migration list --linked).",
      );
    }
    return {
      ...row,
      study_language: normalizeStudyLanguage(row.study_language),
    };
  }

  async updateSettings(patch: Partial<SettingsRow>): Promise<SettingsRow> {
    const current = await this.getSettings();
    return SupabaseRepository.unwrap(
      await this.db
        .from("settings")
        .update(patch)
        .eq("user_id", current.user_id)
        .select("*")
        .single(),
    );
  }

  async exportAll() {
    // Без фильтра `deleted` - бэкап обязан быть точным слепком (§5, loseless).
    // Постранично: обрезка на 1000 строк сделала бы «loseless» неправдой,
    // причём молча - пользователь узнал бы об этом при восстановлении.
    const [folders, notes, cards, review_logs, settings] = await Promise.all([
      selectAll<FolderRow>(() => this.db.from("folders").select("*")),
      selectAll<NoteRow>(() => this.db.from("notes").select("*")),
      selectAll<CardRow>(() => this.db.from("cards").select("*")),
      selectAll<ReviewLogRow>(() => this.db.from("review_logs").select("*")),
      this.db.from("settings").select("*").maybeSingle(),
    ]);
    return {
      folders,
      notes,
      cards,
      review_logs,
      settings: (settings.data as SettingsRow | null) ?? null,
    };
  }

  async replaceAll(data: {
    folders: FolderRow[];
    notes: NoteRow[];
    cards: CardRow[];
    review_logs: ReviewLogRow[];
    settings: SettingsRow | null;
  }): Promise<void> {
    // Восстановление из бэкапа: чистим и заливаем заново.
    //
    // `user_id` из файла отбрасываем - бэкап мог приехать с локальной версии,
    // где стоял 'local-user' (не UUID), или с другого аккаунта. Сервер
    // проставит auth.uid() сам.
    const strip = <T extends { user_id?: string }>(row: T) => {
      const rest = { ...row };
      delete rest.user_id;
      return rest;
    };

    // Настройки читаем ДО удаления: `getSettings` бросает, если строки нет
    // (не сработал триггер `on_auth_user_created`). Случись это после очистки -
    // пользователь получил бы невнятную ошибку про миграцию над уже снесённой
    // базой. Проверка заранее делает отказ безвредным: данные ещё на месте.
    const settingsRow = data.settings ? await this.getSettings() : null;

    // Это ЖЁСТКОЕ удаление, в отличие от soft delete в остальном приложении
    // (delete-политики заведены в схеме ровно ради этого места):
    // replaceAll обязан вернуть базу в вид бэкапа, а не наложить его поверх.
    //
    // Транзакции на всю операцию нет - обрыв посередине оставит базу
    // полупустой. Чинится повторным восстановлением из того же файла, и это
    // честнее, чем «восстановить поверх» с чужими остатками.
    //
    // Порядок: сначала зависимые (review_logs → cards → notes → folders),
    // иначе внешние ключи не дадут удалить родителя. Вставка - в обратном.
    for (const table of ["review_logs", "cards", "notes", "folders"] as const) {
      // PostgREST требует фильтр у delete; RLS всё равно сузит до своих строк.
      const { error } = await this.db
        .from(table)
        .delete()
        .not("id", "is", null);
      if (error) throw new Error(error.message);
    }

    const inserts = [
      { table: "folders", rows: data.folders },
      { table: "notes", rows: data.notes },
      { table: "cards", rows: data.cards },
      { table: "review_logs", rows: data.review_logs },
    ] as const;
    for (const { table, rows } of inserts) {
      if (!rows.length) continue;
      const { error } = await this.db.from(table).insert(rows.map(strip));
      if (error) throw new Error(error.message);
    }

    // Настройки обновляются на месте (delete на них политики нет: строка одна
    // на пользователя). Бэкап без настроек оставляет текущие как есть.
    if (data.settings && settingsRow) {
      const patch = strip(data.settings);
      const { error } = await this.db
        .from("settings")
        .update(patch)
        .eq("user_id", settingsRow.user_id);
      if (error) throw new Error(error.message);
    }
  }
}
