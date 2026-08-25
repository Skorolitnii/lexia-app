import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckIcon } from "@/components/icons";
import { softSpring } from "@/components/motion";
import { formatDuration, formatInterval, plural } from "@/study/format";
import type { QueueOutlook } from "@/data/queue";

interface SummaryStats {
  reviewed: number;
  correct: number;
  newLearned: number;
  elapsedMs: number;
}

function Tile({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-line-soft bg-card-soft p-4">
      <div
        className={`text-[28px] font-extrabold lg:text-[34px] ${accent ? "text-brand-strong" : "text-ink"}`}
      >
        {value}
      </div>
      <div className="text-xs font-semibold text-faint-2 lg:text-[12.5px]">
        {label}
      </div>
    </div>
  );
}

function msUntilTomorrow(now = new Date()): number {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return Math.max(0, tomorrow.getTime() - now.getTime());
}

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} мин`;
  return `${hours} ч ${minutes} мин`;
}

export function SessionSummary({
  stats,
  folderName,
  outlook,
  onHome,
  onCram,
}: {
  stats: SummaryStats;
  folderName: string | null;
  outlook: QueueOutlook;
  onHome: () => void;
  /** Прогон без расписания - когда нового не осталось, но повторить хочется. */
  onCram: () => void;
}) {
  const [resetIn, setResetIn] = useState(() => msUntilTomorrow());
  const accuracy =
    stats.reviewed > 0
      ? Math.round((stats.correct / stats.reviewed) * 100)
      : 100;
  const nothingToDo = stats.reviewed === 0;
  const now = new Date();

  // За очередью ещё стоят новые слова - значит упёрлись в дневную норму, а не
  // выучили всё. В этом состоянии кнопка не должна делать вид, что можно
  // продолжить: лимит жёсткий, а следующий сброс - в полночь.
  const cappedByLimit = outlook.newBeyondLimit > 0;

  useEffect(() => {
    if (!cappedByLimit) return;
    const update = () => setResetIn(msUntilTomorrow());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [cappedByLimit]);

  const waitHint = outlook.nextDueAt
    ? `Ближайшее повторение через ${formatInterval(outlook.nextDueAt, now)}.`
    : null;

  return (
    <div className="flex flex-1 items-center justify-center p-5">
      <motion.div
        className="w-full max-w-[560px] rounded-[26px] bg-card p-8 text-center shadow-summary lg:p-11"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={softSpring}
      >
        <div className="mx-auto mb-5 flex size-[84px] items-center justify-center rounded-full bg-brand-soft">
          <motion.span
            className="flex size-[54px] items-center justify-center rounded-full bg-brand text-white"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ ...softSpring, delay: 0.12 }}
          >
            <CheckIcon className="size-7" />
          </motion.span>
        </div>

        <h2 className="text-[22px] font-extrabold text-ink lg:text-[28px]">
          {nothingToDo ? "На сегодня всё" : "Отличная сессия!"}
        </h2>
        <p className="mt-2 text-[15px] text-faint">
          {nothingToDo
            ? cappedByLimit
              ? `Дневная норма новых слов выбрана. В этой папке ждут ещё ${outlook.newBeyondLimit} ${plural(outlook.newBeyondLimit, "слово", "слова", "слов")}.`
              : (waitHint ?? "Карточек к повторению нет - возвращайтесь позже.")
            : [
                folderName,
                `${stats.reviewed} ${plural(stats.reviewed, "карточка", "карточки", "карточек")}`,
                formatDuration(stats.elapsedMs),
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>

        {/* Срок ближайшего повторения - вторая строка, когда первую занял
            рассказ про норму. */}
        {nothingToDo && cappedByLimit && waitHint && (
          <p className="mt-1 text-[13.5px] text-faint-2">{waitHint}</p>
        )}

        {!nothingToDo && (
          <div className="mt-7 flex gap-3">
            <Tile value={String(stats.reviewed)} label="повторов" />
            <Tile value={`${accuracy}%`} label="верных" accent />
            <Tile value={String(stats.newLearned)} label="новых слов" />
          </div>
        )}

        <div className="mt-7 flex gap-3">
          <button
            type="button"
            onClick={onHome}
            className="flex-1 cursor-pointer rounded-[14px] bg-rail px-4 py-3.5 text-[15px] font-bold text-muted-2"
          >
            На главную
          </button>
          {/* Есть новые за лимитом - честно блокируем CTA и показываем, когда
              лимит сбросится. Нет новых - можно повторить текущую область без
              расписания. */}
          <button
            type="button"
            onClick={cappedByLimit ? undefined : onCram}
            disabled={cappedByLimit}
            className="flex-[1.4] cursor-pointer rounded-[14px] bg-brand px-4 py-3.5 text-[15px] font-extrabold text-white shadow-fab disabled:cursor-not-allowed disabled:bg-track disabled:text-faint-2 disabled:shadow-none"
          >
            {cappedByLimit
              ? `Сброс лимита через ${formatCountdown(resetIn)}`
              : "Повторить"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
