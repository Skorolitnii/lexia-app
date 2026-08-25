import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useNavigate, useSearchParams } from "react-router";
import type { FolderRow, NoteRow } from "@/types";
import { SearchIcon, AddIcon, ImportIcon, PlayIcon } from "@/components/icons";
import { EmptyState } from "@/components/EmptyState";
import { TYPE_LABEL, selectCls } from "@/components/formStyles";
import { useRepo } from "@/data/useRepo";
import { FolderList } from "@/library/FolderList";
import { FolderEditor } from "@/library/FolderEditor";
import { LibrarySkeleton } from "@/library/LibrarySkeleton";
import { LoadError } from "@/components/LoadError";
import { NoteList } from "@/library/NoteList";
import { NoteSheet } from "@/library/NoteSheet";
import { NoteForm } from "@/library/NoteForm";
import {
  dictionaryFields,
  draftFromNote,
  emptyDraft,
  type NoteDraft,
} from "@/library/draft";
import {
  useLibrary,
  type FolderScope,
  type TypeFilter,
} from "@/library/useLibrary";
import { useDebounced } from "@/lib/useDebounced";
import { useSpeechContext } from "@/speech/useSpeechContext";
import { warmAudio } from "@/supabase/functions";
import { ImportPanel } from "@/transfer/ImportPanel";
import { clozePlainText } from "@/study/cloze";
import { plural } from "@/study/format";

/** Что открыто в модалке: новая заметка или существующая. */
type Editing = { draft: NoteDraft; note: NoteRow | null } | null;

/**
 * URL для «Учить». Выбрана папка - заходим сразу в сессию (`go=1`); «все слова» -
 * ведём на экран выбора области (без `go`), чтобы можно было отметить несколько.
 */
function studyUrl(scope: FolderScope): string {
  if (scope === null) return "/study";
  return `/study?folder=${encodeURIComponent(scope)}&go=1`;
}

export function LibraryPage() {
  const repo = useRepo();
  const navigate = useNavigate();

  // Переход из зоны «Добавить» (/add → /library?new=1) сразу открывает форму.
  const [params, setParams] = useSearchParams();
  const openNew = params.get("new") === "1";
  const openImport = params.get("import") === "1";

  const [scope, setScope] = useState<FolderScope>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [editing, setEditing] = useState<Editing>(
    openNew ? { draft: emptyDraft(null), note: null } : null,
  );
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(openImport);
  // Редактор папки: { folder: null } - создание, { folder } - правка.
  // `name` - заготовка имени (пришли из поиска папки в форме слова или из
  // имени папки в колоде импорта).
  // `pickFor` - окно открыто ПОВЕРХ другой формы: созданную папку надо не
  // просто добавить в список, а сразу выбрать в ней, иначе выбор придётся
  // повторять руками. 'note' - форма слова, 'import' - панель импорта.
  const [folderEdit, setFolderEdit] = useState<{
    folder: FolderRow | null;
    name?: string;
    pickFor?: "note" | "import";
  } | null>(null);
  // Папка, созданная из панели импорта: панель держит выбор внутри себя, и
  // это единственный способ вернуть ей только что заведённую папку.
  const [importFolderId, setImportFolderId] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  // Гейт от двойного клика. Ref, а не state: `setSaving` асинхронен, и три
  // синхронных клика (мышь может доставить их до ре-рендера) все видят `false`,
  // из-за чего создавались три папки. Ref обновляется сразу. Один на все записи -
  // в момент времени открыта только одна модалка. State-флаги остаются для UI.
  const writing = useRef(false);

  /**
   * Подстановка из словаря. Ссылка стабильна (useCallback): форма держит её
   * в зависимостях эффекта, и меняющийся коллбэк дёргал бы подстановку заново.
   */
  const applyToDraft = useCallback(
    (update: (current: NoteDraft) => NoteDraft) => {
      setEditing((prev) =>
        prev ? { ...prev, draft: update(prev.draft) } : prev,
      );
    },
    [],
  );

  /** Закрыть форму и убрать ?new=1, иначе она откроется снова при ререндере. */
  const closeSheet = () => {
    setEditing(null);
    if (openNew) setParams({}, { replace: true });
  };

  /** Закрыть импорт и убрать ?import=1 (пришли из онбординга /study). */
  const closeImport = () => {
    setImporting(false);
    if (openImport) setParams({}, { replace: true });
  };

  // Поле поиска обновляется мгновенно, а запрос к списку - с задержкой: без
  // debounce каждая буква била бы новой постраничной выборкой на сервер.
  const debouncedSearch = useDebounced(search.trim(), 350);
  const lib = useLibrary(scope, debouncedSearch, typeFilter);
  // Язык и скорость нужны прогреву: сервер синтезирует тем же голосом и с
  // тем же ключом кэша, что попросит клиент при показе карточки.
  const { studyLanguage, rate } = useSpeechContext();

  const folderRows = useMemo(
    () => lib.folders.flatMap((f) => (f.folder ? [f.folder] : [])),
    [lib.folders],
  );
  const currentFolder = lib.folders.find(
    (f) => (f.folder?.id ?? null) === scope,
  );

  const saveFolder = async (patch: { name: string; color: string | null }) => {
    if (!folderEdit || writing.current) return;
    writing.current = true;
    setSavingFolder(true);
    try {
      if (folderEdit.folder) {
        await repo.updateFolder(folderEdit.folder.id, patch);
      } else {
        const created = await repo.createFolder({
          id: crypto.randomUUID(),
          name: patch.name,
          color: patch.color,
          position: folderRows.length,
        });
        // Папку заводили поверх другой формы - сразу её там и выбираем.
        if (folderEdit.pickFor === "note") {
          setEditing((prev) =>
            prev
              ? { ...prev, draft: { ...prev.draft, folder_id: created.id } }
              : prev,
          );
        } else if (folderEdit.pickFor === "import") {
          // Панель импорта держит выбор внутри себя - передаём id внутрь
          // пропом, иначе созданную папку пришлось бы выбирать руками.
          setImportFolderId(created.id);
        }
      }
      // Папку завели поверх другой формы - слова не менялись, и перечитывать
      // их список незачем: полный `reload` сбросил бы его на первую страницу,
      // и всё под модалкой мигнуло бы.
      setFolderEdit(null);
      if (folderEdit.pickFor) lib.reloadFolders();
      else lib.reload();
    } finally {
      writing.current = false;
      setSavingFolder(false);
    }
  };

  // Подтверждение удаления - инлайн в самом `FolderEditor` (Да/Нет), поэтому
  // здесь никакого `window.confirm`: иначе подтверждать пришлось бы дважды.
  const removeFolder = async (withNotes: boolean) => {
    if (!folderEdit?.folder || writing.current) return;
    writing.current = true;
    setSavingFolder(true);
    try {
      const id = folderEdit.folder.id;
      await repo.deleteFolder(id, withNotes);
      // Если удалили открытую папку - вернуться к «Все слова».
      if (scope === id) setScope(null);
      setFolderEdit(null);
      lib.reload();
    } finally {
      writing.current = false;
      setSavingFolder(false);
    }
  };

  const save = async () => {
    if (!editing || writing.current) return;
    writing.current = true;
    setSaving(true);
    const { draft, note } = editing;
    try {
      // Папка к этому моменту уже существует: новую заводит отдельное окно
      // (`FolderEditor` поверх формы), а не сохранение заметки.
      const payload = {
        folder_id: draft.folder_id,
        type: draft.type,
        front: draft.front.trim(),
        back: draft.back.trim() || null,
        details: draft.details.trim() || null,
        examples: draft.examples.filter((e) => e.text.trim()),
        tags: draft.tags,
        // Транскрипция и аудио приходят из словаря, а не из полей формы (§4),
        // и только если принадлежат текущему слову: у фразы, cloze и кириллицы
        // лукапа нет, и без этой проверки сохранялись бы данные прежнего слова.
        ...dictionaryFields(draft),
        // У cloze обратной карточки не бывает (§3) - не даём ей просочиться.
        reverse: draft.type === "cloze" ? false : draft.reverse,
      };
      if (note) {
        await repo.updateNote(note.id, payload);
      } else {
        await repo.createNote({
          id: crypto.randomUUID(),
          image_url: null,
          ...payload,
        });
      }
      // Прогрев озвучки: синтез идёт секунды, и без него первый показ карточки
      // встречал бы лоадером. Ответа не ждём и осечку глотаем - при промахе
      // клиент сходит за синтезом сам (см. `warmAudio`). Греем и правку тоже:
      // у изменённого слова или нового примера озвучки ещё нет.
      warmAudio(
        [
          payload.type === "cloze"
            ? clozePlainText(payload.front)
            : payload.front,
          ...payload.examples.map((e) => e.text),
        ],
        studyLanguage,
        rate,
      );
      closeSheet();
      lib.reload();
    } finally {
      // Без finally падение IndexedDB оставило бы форму навсегда в «…».
      writing.current = false;
      setSaving(false);
    }
  };

  // Подтверждение удаления - инлайн в самой `NoteForm` (Да/Нет), поэтому здесь
  // никакого `window.confirm`: иначе подтверждать пришлось бы дважды.
  const remove = async () => {
    if (!editing?.note || writing.current) return;
    writing.current = true;
    try {
      await repo.deleteNote(editing.note.id);
      closeSheet();
      lib.reload();
    } finally {
      writing.current = false;
    }
  };

  if (lib.loading) return <LibrarySkeleton />;

  // Чтение не удалось - предлагаем повтор. Показывать при этом пустой список
  // нельзя: «слов нет» и «слова не загрузились» - разные вещи, а действия
  // (правка, удаление) всё равно упали бы.
  if (lib.error) {
    return (
      <div className="flex h-full flex-col p-5 lg:p-8">
        <LoadError what="слова" onRetry={lib.reload} />
      </div>
    );
  }

  const title = currentFolder?.folder?.name ?? "Все слова";
  // Совсем пустой аккаунт: ни одного слова во всех папках. Показываем онбординг
  // вместо поиска/фильтров/пустого списка (искать нечего, папок тоже нет).
  const emptyAccount = lib.totalNotes === 0;

  return (
    <div className="flex h-full">
      {/* Колонка папок - десктоп. Пустому аккаунту скрываем: папок ещё нет. */}
      {!emptyAccount && (
        <aside className="hidden w-[226px] shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
          <FolderList
            folders={lib.folders}
            selected={scope}
            onSelect={setScope}
            onCreate={() => setFolderEdit({ folder: null })}
            onEdit={(folder) => setFolderEdit({ folder })}
          />
        </aside>
      )}

      <div
        className={`flex min-w-0 flex-1 flex-col overflow-y-auto ${
          emptyAccount ? "" : "px-5 py-6 lg:px-7"
        }`}
      >
        {/* Заголовок + действия. flex-wrap: держим в одну строку, пока влезает;
            кнопки переносятся вниз только на самых узких экранах, когда иначе
            перекрыли бы заголовок. Без завязки на конкретный брейкпоинт.
            Пустому аккаунту шапка не нужна: «Все слова · 0 слов» с кнопками
            дублировало бы онбординг, который и так весь про эти же действия. */}
        {!emptyAccount && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-[150px] flex-1 items-center gap-2.5 lg:min-w-0">
              <span
                className="hidden size-2.5 shrink-0 rounded-full bg-brand lg:block"
                aria-hidden
              />
              <h1 className="text-[26px] font-extrabold text-ink lg:truncate lg:text-[20px]">
                <span className="lg:hidden">Библиотека</span>
                <span className="hidden lg:inline">{title}</span>
              </h1>
              <span className="hidden shrink-0 text-[14px] text-faint-2 lg:inline">
                {lib.totalInFolder}{" "}
                {plural(lib.totalInFolder, "слово", "слова", "слов")}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {lib.totalInFolder > 0 && (
                <button
                  type="button"
                  onClick={() => void navigate(studyUrl(scope))}
                  className="hidden cursor-pointer items-center gap-1.5 rounded-[11px] bg-brand px-4 py-2 text-[13.5px] font-extrabold text-white shadow-brand transition-colors hover:bg-brand-strong lg:flex"
                >
                  <PlayIcon className="size-3.5" />
                  Учить
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setEditing({ draft: emptyDraft(scope), note: null })
                }
                className="flex cursor-pointer items-center gap-1.5 rounded-[11px] border border-brand/35 bg-brand-soft px-3.5 py-2 text-[13.5px] font-bold text-brand-ink transition-colors hover:border-brand/60 hover:bg-brand-wash"
              >
                <AddIcon className="size-3.5" strokeWidth={2.5} />
                Добавить
              </button>
              <button
                type="button"
                onClick={() => setImporting(true)}
                className="flex cursor-pointer items-center gap-1.5 rounded-[11px] border border-line bg-card px-3.5 py-2 text-[13.5px] font-bold text-ink transition-colors hover:border-hint hover:bg-rail"
              >
                <ImportIcon className="size-3.5" />
                Импорт
              </button>
            </div>
          </div>
        )}

        {emptyAccount ? (
          <EmptyState
            title="Соберите первую колоду"
            description="Достаточно 10 слов, чтобы запустить интервальные повторения."
            onAddWord={() =>
              setEditing({ draft: emptyDraft(null), note: null })
            }
            onImport={() => setImporting(true)}
            onInstalled={lib.reload}
          />
        ) : (
          <>
            {/* Поиск + фильтры. Мобайл: поиск на всю ширину, селекты - отдельным
            рядом под ним. Десктоп: всё в одну строку. */}
            <div className="mb-4 flex flex-col gap-2 lg:flex-row">
              <div className="flex flex-1 items-center gap-2.5 rounded-[12px] border border-line bg-card px-3.5 py-2.5">
                <SearchIcon className="size-4 shrink-0 text-hint" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск слова или перевода"
                  aria-label="Поиск"
                  className="w-full bg-transparent text-[14.5px] text-ink outline-none placeholder:text-hint"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                  aria-label="Тип карточки"
                  className={`min-w-0 flex-1 rounded-[12px] border border-line bg-card py-2.5 pl-3.5 text-[13.5px] font-semibold text-muted-2 outline-none lg:flex-none ${selectCls}`}
                >
                  <option value="all">Все типы</option>
                  <option value="basic">{TYPE_LABEL.basic}</option>
                  <option value="cloze">{TYPE_LABEL.cloze}</option>
                </select>
              </div>
            </div>

            {/* Папки - мобайл (на десктопе они в левой колонке) */}
            <div className="mb-5 lg:hidden">
              <FolderList
                folders={lib.folders}
                selected={scope}
                onSelect={setScope}
                onCreate={() => setFolderEdit({ folder: null })}
                onEdit={(folder) => setFolderEdit({ folder })}
              />
            </div>

            <NoteList
              notes={lib.notes}
              now={lib.now}
              hasMore={lib.hasMore}
              loadingMore={lib.loadingMore}
              onLoadMore={lib.loadMore}
              onOpen={(item) =>
                setEditing({ draft: draftFromNote(item.note), note: item.note })
              }
            />
          </>
        )}
      </div>

      <AnimatePresence>
        {importing && (
          <NoteSheet wide onClose={closeImport}>
            <ImportPanel
              folders={folderRows}
              onClose={closeImport}
              onImported={lib.reload}
              pickedFolderId={importFolderId}
              onCreateFolder={(name) =>
                setFolderEdit({ folder: null, name, pickFor: "import" })
              }
            />
          </NoteSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editing && (
          <NoteSheet onClose={closeSheet}>
            <NoteForm
              draft={editing.draft}
              folders={folderRows}
              saving={saving}
              onChange={(draft) => setEditing({ ...editing, draft })}
              onApply={applyToDraft}
              onSubmit={() => void save()}
              onCancel={closeSheet}
              onCreateFolder={(name) =>
                setFolderEdit({ folder: null, name, pickFor: "note" })
              }
              onDelete={editing.note ? () => void remove() : undefined}
            />
          </NoteSheet>
        )}
      </AnimatePresence>

      {/* Окно папки - ПОСЛЕ формы слова: оно открывается поверх неё (создание
          папки из выбора папки), а порядок в DOM решает, кто окажется сверху. */}
      <AnimatePresence>
        {folderEdit && (
          <NoteSheet fitContent onClose={() => setFolderEdit(null)}>
            <FolderEditor
              folder={folderEdit.folder}
              initialName={folderEdit.name}
              noteCount={
                folderEdit.folder
                  ? (lib.folders.find(
                      (f) => f.folder?.id === folderEdit.folder!.id,
                    )?.noteCount ?? 0)
                  : 0
              }
              saving={savingFolder}
              onSave={(patch) => void saveFolder(patch)}
              onDelete={
                folderEdit.folder
                  ? (withNotes) => void removeFolder(withNotes)
                  : undefined
              }
              onCancel={() => setFolderEdit(null)}
            />
          </NoteSheet>
        )}
      </AnimatePresence>
    </div>
  );
}
