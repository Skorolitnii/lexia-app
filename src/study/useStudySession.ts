import { useCallback, useEffect, useMemo, useState } from "react";
import { Rating, State, type Grade } from "ts-fsrs";
import type { CardRow, NoteRow } from "@/types";
import { useRepo } from "@/data/useRepo";
import { applyReview } from "@/data/fsrs";
import {
  buildQueue,
  queueCounts,
  queueOutlook,
  type QueueOptions,
  type QueueOutlook,
  type Scope,
} from "@/data/queue";

/** Снимок для Undo: состояние карточки до оценки + id строки журнала. */
interface HistoryEntry {
  card: CardRow;
  logId: string;
  wasCorrect: boolean;
  wasNew: boolean;
}

export interface RatingOption {
  rating: Grade;
}

export interface StudySession {
  loading: boolean;
  /** Очередь не собралась (нет сети при серверном хранилище / отказ БД). */
  error: boolean;
  /** Текущая карточка и её заметка; null - очередь пуста (сессия завершена). */
  current: { card: CardRow; note: NoteRow } | null;
  /** Следующая в очереди - только для прогрева озвучки, в UI не показывается. */
  next: { card: CardRow; note: NoteRow } | null;
  /** Все заметки области аккаунта: нужны тренажёрам для вариантов ответа. */
  notes: NoteRow[];
  folderName: string | null;
  revealed: boolean;
  reveal: () => void;
  rate: (rating: Grade) => void;
  undo: () => void;
  canUndo: boolean;
  /** Кнопки оценки в порядке Again→Easy. */
  options: RatingOption[];
  counts: { total: number; fresh: number; review: number };
  done: number;
  stats: {
    reviewed: number;
    correct: number;
    newLearned: number;
    elapsedMs: number;
  };
  finished: boolean;
  restart: () => void;
  /** Что осталось за очередью: новые сверх лимита и ближайший срок. */
  outlook: QueueOutlook;
}

const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export function useStudySession(
  scope: Scope = { kind: "all" },
  cram = false,
  kind: QueueOptions["kind"] = "all",
): StudySession {
  const repo = useRepo();

  /** Загруженная сессия: очередь + справочники. null - ещё грузится. */
  interface Loaded {
    notesById: Map<string, NoteRow>;
    notes: NoteRow[];
    /** Имя папки сессии; фиксируется при сборке, чтобы жить и на экране итога. */
    folderName: string | null;
    initialTotal: number;
    startedAt: number;
  }
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [queue, setQueue] = useState<CardRow[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [outlook, setOutlook] = useState<QueueOutlook>({
    newBeyondLimit: 0,
    nextDueAt: null,
  });
  // Сборка очереди при монтировании и по restart. Одна запись состояния -
  // без каскада setState внутри эффекта.
  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    let active = true;
    Promise.all([
      repo.listCards(),
      repo.listNotes(),
      repo.listFolders(),
      repo.getSettings(),
      repo.countNewCardsIntroduced(),
    ])
      .then(([cards, allNotes, allFolders, settings, introducedToday]) => {
        if (!active) return;
        // Остаток дневного лимита, а не сам лимит: иначе рестарт подтягивал бы
        // новую порцию новых карточек. `extraNew` - осознанный добор поверх.
        const newCardsLeft = settings.new_cards_per_day - introducedToday;
        const parsedScope = JSON.parse(scopeKey) as Scope;
        const built = buildQueue(cards, allNotes, {
          scope: parsedScope,
          newCardsLeft,
          cram,
          kind,
        });
        // Резерв считаем от того же остатка: экран итога должен объяснить, из-за
        // чего очередь пуста - лимит или в папке правда ничего не осталось.
        setOutlook(
          queueOutlook(cards, allNotes, { scope: parsedScope, newCardsLeft }),
        );
        const notesById = new Map(allNotes.map((n) => [n.id, n]));
        const firstFolderId = built.length
          ? (notesById.get(built[0]!.note_id)?.folder_id ?? null)
          : null;
        setLoaded({
          notesById,
          notes: allNotes,
          folderName:
            allFolders.find((f) => f.id === firstFolderId)?.name ?? null,
          initialTotal: built.length,
          startedAt: Date.now(),
        });
        setQueue(built);
        setHistory([]);
        setRevealed(false);
        setFinishedAt(null);
        // Успех после неудачи (повтор по кнопке) снимает прежнюю ошибку.
        setError(false);
      })
      // Офлайн при серверном хранилище: без catch экран навсегда остался бы
      // в загрузке и дал unhandled rejection (как в `useStats`).
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [repo, scopeKey, cram, kind, reloadKey]);

  const current = useMemo(() => {
    const card = queue[0];
    if (!card || !loaded) return null;
    const note = loaded.notesById.get(card.note_id);
    return note ? { card, note } : null;
  }, [queue, loaded]);

  // Следующая карточка очереди - для прогрева озвучки, пока пользователь
  // смотрит текущую. Синтез идёт секунды, и без прогрева каждая новая фраза
  // встречала бы пользователя лоадером.
  const next = useMemo(() => {
    const card = queue[1];
    if (!card || !loaded) return null;
    const note = loaded.notesById.get(card.note_id);
    return note ? { card, note } : null;
  }, [queue, loaded]);

  const folderName = loaded?.folderName ?? null;

  // Кнопки не показывают интервал, поэтому и считать его (scheduler.repeat на
  // каждой карточке) больше не нужно - набор оценок постоянный.
  const options = useMemo<RatingOption[]>(
    () => (current ? GRADES.map((rating) => ({ rating })) : []),
    [current],
  );

  const reveal = useCallback(() => setRevealed(true), []);

  const rate = useCallback(
    (rating: Grade) => {
      if (!current) return;
      const { card } = current;
      const { cardPatch, logRow } = applyReview(card, rating);

      setHistory((h) => [
        ...h,
        {
          card,
          logId: logRow.id,
          wasCorrect: rating !== Rating.Again,
          wasNew: card.state === State.New,
        },
      ]);

      // Cram не меняет расписание - только прокручивает очередь.
      if (!cram) void repo.applyCardPatch(card.id, cardPatch, logRow);

      // Очередь считаем снаружи апдейтера: он должен быть чистым (в StrictMode
      // выполняется дважды), а setFinishedAt - побочный эффект.
      const [, ...rest] = queue;
      // Again возвращает карточку в конец очереди - доучить в этой же сессии.
      const next =
        rating === Rating.Again ? [...rest, { ...card, ...cardPatch }] : rest;
      setQueue(next);
      // Фиксируем момент окончания, чтобы длительность не «тикала» на итоге.
      if (next.length === 0) setFinishedAt(Date.now());
      setRevealed(false);
    },
    [current, queue, repo, cram],
  );

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    if (!cram) void repo.undoReview(last.card, last.logId);
    setFinishedAt(null);
    setHistory((h) => h.slice(0, -1));
    setQueue((q) => {
      // Again-карточка была отправлена в конец - убрать её оттуда.
      const withoutRequeued = last.wasCorrect
        ? q
        : q.filter((c, i) => !(i === q.length - 1 && c.id === last.card.id));
      return [last.card, ...withoutRequeued];
    });
    setRevealed(true);
  }, [history, repo, cram]);

  const restart = useCallback(() => setReloadKey((k) => k + 1), []);

  const stats = useMemo(
    () => ({
      reviewed: history.length,
      correct: history.filter((h) => h.wasCorrect).length,
      newLearned: history.filter((h) => h.wasNew).length,
      elapsedMs: finishedAt && loaded ? finishedAt - loaded.startedAt : 0,
    }),
    [history, finishedAt, loaded],
  );

  return {
    loading: loaded === null && !error,
    error,
    current,
    next,
    notes: loaded?.notes ?? [],
    folderName,
    revealed,
    reveal,
    rate,
    undo,
    canUndo: history.length > 0,
    options,
    counts: queueCounts(queue),
    done: Math.max(0, (loaded?.initialTotal ?? 0) - queue.length),
    stats,
    finished: loaded !== null && queue.length === 0,
    restart,
    outlook,
  };
}
