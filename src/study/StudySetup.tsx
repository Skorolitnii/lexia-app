import { useCallback, useEffect, useMemo, useState } from "react";
import { State } from "ts-fsrs";
import { motion } from "motion/react";
import type { CardRow, FolderRow, NoteRow } from "@/types";
import { useRepo } from "@/data/useRepo";
import { NO_FOLDER } from "@/data/queue";
import { AddIcon, RepeatIcon, StudyIcon } from "@/components/icons";
import { EmptyState } from "@/components/EmptyState";
import { MobileSettingsButton } from "@/components/MobileSettingsButton";
import { listContainer, listItem } from "@/components/motion";
import { StudySetupSkeleton } from "@/study/StudySetupSkeleton";
import {
  OnboardingSheets,
  type OnboardingSheet,
} from "@/library/OnboardingSheets";
import { FOLDER_GRAY, folderDotColor } from "@/library/folderColors";
import { plural } from "@/study/format";
import type { StudyFlow } from "@/study/exercises";

/** Счётчики папки для экрана выбора. */
interface FolderStat {
  folder: FolderRow | null;
  /** true для псевдо-строки «Без папки» (folder_id = null). */
  noFolder?: boolean;
  noteCount: number;
  dueCount: number;
  newCount: number;
}

/**
 * Экран выбора области изучения: какие папки и в каком режиме.
 * По «Начать» вызывает `onStart` с выбором - родитель строит очередь.
 * `null` в наборе папок означает «все папки».
 */
export function StudySetup({
  initialFolderId,
  initialFlow = "learn",
  onStart,
}: {
  /** Папка, с которой пришли (из «Учить папку»); undefined - стартуем со «все». */
  initialFolderId?: string | null;
  /** Сценарий обучения: новое через карточки или повторы через mixed. */
  initialFlow?: StudyFlow;
  onStart: (opts: { folderIds: string[] | null; flow: StudyFlow }) => void;
}) {
  const repo = useRepo();
  const [data, setData] = useState<{
    folders: FolderRow[];
    notes: NoteRow[];
    cards: CardRow[];
  } | null>(null);
  // Выбранные папки; пустой набор = «все». `null` в наборе невозможен.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialFolderId ? [initialFolderId] : []),
  );
  const [flow, setFlowState] = useState<StudyFlow>(initialFlow);
  // Модалка онбординга поверх пустого экрана (слово / импорт).
  const [sheet, setSheet] = useState<OnboardingSheet>(null);
  const [loadedAt] = useState(() => Date.now());

  // Счётчик перезагрузок: колода записывается прямо на этом экране (стартовая
  // или через модалки), и после неё данные надо перечитать (иначе «0 слов»).
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    Promise.all([repo.listFolders(), repo.listNotes(), repo.listCards()]).then(
      ([folders, notes, cards]) => {
        if (active) setData({ folders, notes, cards });
      },
    );
    return () => {
      active = false;
    };
  }, [repo, reloadKey]);

  const stats = useMemo<FolderStat[]>(() => {
    if (!data) return [];
    const now = loadedAt;
    const folderByNote = new Map(data.notes.map((n) => [n.id, n.folder_id]));
    const active = data.cards.filter((c) => !c.suspended);

    const countFor = (match: (folderId: string | null) => boolean) => {
      let noteCount = 0;
      let dueCount = 0;
      let newCount = 0;
      const seenNotes = new Set<string>();
      for (const c of active) {
        const fid = folderByNote.get(c.note_id) ?? null;
        if (!match(fid)) continue;
        if (!seenNotes.has(c.note_id)) {
          seenNotes.add(c.note_id);
          noteCount++;
        }
        if (c.state === State.New) newCount++;
        else if (new Date(c.due).getTime() <= now) dueCount++;
      }
      return { noteCount, dueCount, newCount };
    };

    const noFolderStat = {
      folder: null,
      noFolder: true,
      ...countFor((fid) => fid === null),
    };

    return [
      { folder: null, ...countFor(() => true) },
      ...data.folders.map((folder) => ({
        folder,
        ...countFor((fid) => fid === folder.id),
      })),
      // Строка «Без папки» - только если такие слова есть (иначе не показываем).
      ...(noFolderStat.noteCount > 0 ? [noFolderStat] : []),
    ];
  }, [data, loadedAt]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setFlow = (next: StudyFlow) => {
    setFlowState(next);
    setSelected(new Set());
  };

  const start = () =>
    onStart({ folderIds: selected.size ? [...selected] : null, flow });

  if (!data) return <StudySetupSkeleton />;

  // Совсем пустой аккаунт: учить нечего в принципе. Вместо экрана выбора с
  // «мёртвой» кнопкой «Начать» (она уводила бы на «На сегодня всё, возвращайтесь
  // позже» - обман для того, кто ещё не добавил ни слова) - онбординг к двум
  // реальным способам наполнить колоду.
  if (data.notes.length === 0) {
    return (
      <>
        <EmptyState
          title="Соберите первую колоду"
          description="Достаточно 10 слов, чтобы запустить интервальные повторения."
          // Модалки открываются прямо здесь, без ухода в Библиотеку: онбординг
          // не должен телепортировать в другой раздел. Записали - перечитываем
          // свои данные, и экран сам сменится на обычный выбор области.
          onAddWord={() => setSheet("note")}
          onImport={() => setSheet("import")}
          onInstalled={reload}
        />
        <OnboardingSheets
          open={sheet}
          folders={data.folders}
          onClose={() => setSheet(null)}
          onChanged={reload}
        />
      </>
    );
  }

  // Выбираемые строки: настоящие папки + «Без папки». Первый элемент stats -
  // сводный бакет «все» (folder: null, без noFolder), его в список не берём.
  const folderStats = stats.filter((s) => s.folder !== null || s.noFolder);
  const visibleFolderStats = folderStats.filter((s) =>
    flow === "learn" ? s.newCount > 0 : s.dueCount > 0,
  );
  const canStart = visibleFolderStats.length > 0;
  const startLabel = flow === "learn" ? "Начать изучение" : "Начать повторение";

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[560px] flex-col px-5 py-7 lg:py-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold text-ink lg:text-[30px]">
          Что учим?
        </h1>
        <MobileSettingsButton />
      </div>
      <p className="mt-1.5 text-[14.5px] text-faint">
        Выберите папки или учите всё.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2">
        {[
          {
            key: "learn" as const,
            title: "Изучение",
            description: "Новые слова через карточки.",
            Icon: StudyIcon,
          },
          {
            key: "review" as const,
            title: "Повторение",
            description: "Смешанные задания по знакомым словам.",
            Icon: RepeatIcon,
          },
        ].map(({ key, title, description, Icon }) => {
          const on = flow === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFlow(key)}
              aria-pressed={on}
              className={`min-h-[108px] cursor-pointer rounded-[15px] border px-4 py-3.5 text-left transition-colors ${
                on
                  ? "border-brand bg-brand-soft"
                  : "border-line bg-card hover:bg-rail"
              }`}
            >
              <span
                className={`flex size-9 items-center justify-center rounded-[12px] ${
                  on ? "bg-brand text-white" : "bg-rail text-muted-2"
                }`}
              >
                <Icon className="size-5" strokeWidth={2.25} />
              </span>
              <span className="mt-3 block text-[15px] font-extrabold text-ink">
                {title}
              </span>
              <span className="mt-1.5 block text-[12.5px] leading-snug text-faint-2">
                {description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Папки */}
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pb-[142px] lg:pb-0">
        <p className="mb-2 px-1 text-[12px] font-extrabold tracking-[0.06em] text-label uppercase">
          Папки {selected.size === 0 ? "· все" : null}
        </p>
        <motion.div
          className="flex flex-col gap-1.5"
          variants={listContainer}
          initial="hidden"
          animate="visible"
        >
          {visibleFolderStats.length === 0 && (
            <p className="px-1 py-4 text-[14px] text-faint">
              {flow === "learn"
                ? "Новых слов сейчас нет."
                : "Повторений сейчас нет."}
            </p>
          )}
          {visibleFolderStats.map((s) => {
            // «Без папки» - псевдо-строка с id-сентинелом; у настоящей папки свой id.
            const id = s.noFolder ? NO_FOLDER : s.folder!.id;
            const name = s.noFolder ? "Без папки" : s.folder!.name;
            const on = selected.has(id);
            const count = flow === "learn" ? s.newCount : s.dueCount;
            return (
              <motion.button
                key={id}
                type="button"
                variants={listItem}
                onClick={() => toggle(id)}
                aria-pressed={on}
                className={`flex cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors ${
                  on
                    ? "border-brand bg-brand-soft"
                    : "border-line bg-card hover:bg-rail"
                }`}
              >
                <span
                  className={`size-2.5 shrink-0 rounded-full ring-4 transition-shadow ${
                    on ? "ring-brand-soft" : "ring-transparent"
                  }`}
                  style={{
                    background: s.noFolder
                      ? FOLDER_GRAY
                      : folderDotColor(s.folder!.color),
                  }}
                />
                <span
                  className={`flex-1 truncate text-[15px] font-bold ${s.noFolder ? "text-muted-2 italic" : "text-ink"}`}
                >
                  {name}
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-faint-2">
                  {flow === "learn"
                    ? `${count} ${plural(count, "новое", "новых", "новых")}`
                    : `${count} к повтору`}
                </span>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      <button
        type="button"
        onClick={start}
        disabled={!canStart}
        className="mt-5 hidden w-full cursor-pointer rounded-[16px] bg-brand px-4 py-4 text-[15px] font-extrabold text-white shadow-fab disabled:cursor-not-allowed disabled:bg-brand-muted disabled:shadow-none lg:block"
      >
        {startLabel}
      </button>

      <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-[24px] border-t border-line-soft bg-card px-5 pt-4 pb-5 shadow-[0_-14px_34px_rgba(55,42,28,0.12)] lg:hidden">
        <div className="grid grid-cols-[1.25fr_1fr] gap-2.5">
          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            className="min-h-12 cursor-pointer rounded-[15px] bg-brand px-4 py-3 text-[14.5px] font-extrabold text-white shadow-brand disabled:cursor-not-allowed disabled:bg-brand-muted disabled:shadow-none"
          >
            {startLabel}
          </button>
          <button
            type="button"
            onClick={() => setSheet("note")}
            className="flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-[15px] border border-brand/35 bg-brand-soft px-3 py-3 text-[14px] font-extrabold text-brand-ink transition-colors active:bg-brand-wash"
          >
            <AddIcon className="size-3.5" strokeWidth={2.5} />
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
