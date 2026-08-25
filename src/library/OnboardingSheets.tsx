import { useCallback, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import type { FolderRow } from "@/types";
import { useRepo } from "@/data/useRepo";
import { NoteForm } from "@/library/NoteForm";
import { NoteSheet } from "@/library/NoteSheet";
import { dictionaryFields, emptyDraft, type NoteDraft } from "@/library/draft";
import { FolderEditor } from "@/library/FolderEditor";
import { ImportPanel } from "@/transfer/ImportPanel";

/** Что открыто поверх экрана. */
export type OnboardingSheet = "note" | "import" | null;

/**
 * Модалки добавления слова и импорта, пригодные для любого экрана.
 *
 * Нужны, потому что пустое состояние живёт не только в Библиотеке: с экрана
 * Изучения раньше приходилось уводить пользователя в `/library?new=1`, и
 * онбординг превращался в редирект неизвестно куда. Здесь только путь
 * «создать новое» - редактирование существующих заметок остаётся в
 * `LibraryPage`, где к нему есть список и выбранная папка.
 */
export function OnboardingSheets({
  open,
  folders,
  onClose,
  onChanged,
}: {
  open: OnboardingSheet;
  /** Папки для селекта в форме; пустому аккаунту - пустой список. */
  folders: FolderRow[];
  onClose: () => void;
  /** Данные записаны - экран-хозяин обязан перечитать себя. */
  onChanged: () => void;
}) {
  const repo = useRepo();
  const [draft, setDraft] = useState<NoteDraft>(() => emptyDraft(null));
  const [saving, setSaving] = useState(false);
  // Окно создания папки поверх формы слова; `name` - заготовка из поиска папки.
  // `pickFor` - куда вернуть созданную папку: в черновик слова или в панель
  // импорта (та держит выбор внутри себя, поэтому получает id пропом).
  const [folderNew, setFolderName] = useState<{
    name: string;
    pickFor: "note" | "import";
  } | null>(null);
  const [importFolderId, setImportFolderId] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  // Гейт от двойного клика: `setSaving` асинхронен, два синхронных клика оба
  // увидели бы false и записали заметку дважды (тот же приём, что в LibraryPage).
  const writing = useRef(false);

  /** Ссылка стабильна: форма держит её в зависимостях эффекта подстановки. */
  const applyToDraft = useCallback(
    (update: (current: NoteDraft) => NoteDraft) => {
      setDraft((prev) => update(prev));
    },
    [],
  );

  const close = () => {
    // Черновик сбрасываем при закрытии, а не при открытии: иначе он мигал бы
    // старым содержимым на кадр выхода из анимации.
    setDraft(emptyDraft(null));
    onClose();
  };

  /** Создать папку и сразу выбрать её там, откуда пришли. */
  const saveFolder = async (patch: { name: string; color: string | null }) => {
    if (writing.current) return;
    writing.current = true;
    setSavingFolder(true);
    try {
      const created = await repo.createFolder({
        id: crypto.randomUUID(),
        name: patch.name,
        color: patch.color,
        position: folders.length,
      });
      if (folderNew?.pickFor === "import") setImportFolderId(created.id);
      else setDraft((prev) => ({ ...prev, folder_id: created.id }));
      setFolderName(null);
      // Список папок живёт у экрана-хозяина - без перечитки новая не появится
      // в выпадашке формы.
      onChanged();
    } finally {
      writing.current = false;
      setSavingFolder(false);
    }
  };

  const save = async () => {
    if (writing.current) return;
    writing.current = true;
    setSaving(true);
    try {
      // Папка к этому моменту уже существует: её заводит отдельное окно
      // (`FolderEditor` поверх формы), а не сохранение заметки.
      await repo.createNote({
        id: crypto.randomUUID(),
        image_url: null,
        folder_id: draft.folder_id,
        type: draft.type,
        front: draft.front.trim(),
        back: draft.back.trim() || null,
        details: draft.details.trim() || null,
        examples: draft.examples.filter((e) => e.text.trim()),
        study_language: draft.study_language,
        tags: draft.tags,
        // Транскрипция и аудио - только если принадлежат текущему слову (§4).
        ...dictionaryFields(draft),
        // У cloze обратной карточки не бывает (§3).
        reverse: draft.type === "cloze" ? false : draft.reverse,
      });
      close();
      onChanged();
    } finally {
      // Без finally падение хранилища оставило бы форму навсегда в «Сохраняю…».
      writing.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open === "note" && (
          <NoteSheet onClose={close}>
            <NoteForm
              draft={draft}
              folders={folders}
              saving={saving}
              onChange={setDraft}
              onApply={applyToDraft}
              onSubmit={() => void save()}
              onCancel={close}
              onCreateFolder={(name) =>
                setFolderName({ name, pickFor: "note" })
              }
            />
          </NoteSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open === "import" && (
          <NoteSheet wide onClose={close}>
            <ImportPanel
              folders={folders}
              onClose={close}
              onImported={onChanged}
              pickedFolderId={importFolderId}
              onCreateFolder={(name) =>
                setFolderName({ name, pickFor: "import" })
              }
            />
          </NoteSheet>
        )}
      </AnimatePresence>

      {/* Окно папки - ПОСЛЕ формы слова: оно открывается поверх неё, а порядок
          в DOM решает, кто окажется сверху. Пустому аккаунту это единственный
          способ завести первую папку, без которой слово не сохранить. */}
      <AnimatePresence>
        {folderNew && (
          <NoteSheet fitContent onClose={() => setFolderName(null)}>
            <FolderEditor
              folder={null}
              initialName={folderNew.name}
              saving={savingFolder}
              onSave={(patch) => void saveFolder(patch)}
              onCancel={() => setFolderName(null)}
            />
          </NoteSheet>
        )}
      </AnimatePresence>
    </>
  );
}
