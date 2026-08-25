import type { ReactNode } from "react";
import { motion } from "motion/react";
import { AddIcon, ImportIcon, StudyIcon } from "@/components/icons";
import { Spinner } from "@/components/Loading";
import { softSpring } from "@/components/motion";
import {
  STARTER_DECK_PRESETS,
  STARTER_DECK_SIZE,
} from "@/transfer/starterDeck";
import { useStarterDeck } from "@/transfer/useStarterDeck";
import { plural } from "@/study/format";

interface Path {
  key: string;
  icon: ReactNode;
  title: string;
  /** Полное пояснение - десктоп (в плитке грида). */
  description: string;
  /** Короткое пояснение - мобайл (в строке списка). */
  short: string;
  onClick: () => void;
}

/** Стрелка «дальше» в мобильных строках. */
function Chevron() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-faint-2"
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * Пустое / первое состояние (макет «Тёплый - Пустой экран v2»).
 *
 * Одна панель на Study и Library: онбординг должен выглядеть одинаково, куда бы
 * пользователь ни зашёл первым. Внутри - два реальных пути наполнить колоду
 * (вручную / импорт) и стартовая колода в один клик. Тупиков нет: каждая
 * кнопка что-то делает, а не объясняет.
 *
 * Пути одни и те же на обоих брейкпоинтах, но разной вёрстки: на десктопе -
 * грид из плиток с разделителями, на мобайле - список строк со стрелкой.
 */
export function EmptyState({
  title,
  description,
  onAddWord,
  onImport,
  onInstalled,
}: {
  title: string;
  description: string;
  onAddWord: () => void;
  /** Импорт колоды: одна модалка, внутри - табы «файл» и «из буфера». */
  onImport: () => void;
  /** Стартовая колода записана - хозяину экрана пора перечитать данные. */
  onInstalled: () => void;
}) {
  const starter = useStarterDeck(onInstalled);

  const paths: Path[] = [
    {
      key: "add",
      icon: <AddIcon className="size-[18px]" strokeWidth={2.4} />,
      title: "Добавить слово",
      description:
        "Транскрипция и озвучка подтянутся сами - вводить нужно слово и перевод.",
      short: "Данные подтянутся сами",
      onClick: onAddWord,
    },
    {
      key: "import",
      icon: <ImportIcon className="size-[18px]" />,
      title: "Импорт колоды",
      description:
        "JSON от нейросети - файлом или вставкой из буфера. Покажем превью и найдём дубликаты.",
      short: "JSON файлом или из буфера",
      onClick: onImport,
    },
  ];

  return (
    <div className="flex flex-1 justify-center px-5 pt-8 pb-10 lg:px-10 lg:pt-[72px] lg:pb-14">
      <motion.div
        className="w-full max-w-[760px]"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={softSpring}
      >
        <div className="overflow-hidden rounded-[22px] border border-line bg-card shadow-panel">
          {/* Шапка */}
          <div className="border-b border-line-soft px-6 pt-7 pb-6 lg:px-[34px] lg:pt-[34px] lg:pb-7">
            <div className="flex items-center gap-4 lg:gap-[18px]">
              {/* Иконка - только на десктопе: на мобайле она съедала высоту
                  первого экрана, не добавляя смысла к заголовку. */}
              <div className="hidden size-[52px] shrink-0 items-center justify-center rounded-[15px] bg-brand-soft text-brand-ink-deep lg:flex">
                <StudyIcon className="size-[26px]" strokeWidth={2.1} />
              </div>
              <div className="min-w-0">
                <h1 className="text-[21px] font-extrabold tracking-[-0.015em] text-ink lg:text-[26px]">
                  {title}
                </h1>
                <p className="max-w-[520px] text-[14.5px] leading-relaxed text-ink-2 lg:text-[15.5px]">
                  {description}
                </p>
              </div>
            </div>
          </div>

          {/* Два пути. Десктоп - грид с волосяными разделителями (фон line-soft
              просвечивает в зазорах gap-px), мобайл - обычный список. */}
          <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-px lg:bg-line-soft">
            {paths.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={p.onClick}
                className="flex w-full cursor-pointer items-center gap-3.5 border-b border-line-soft bg-card px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-card-soft lg:flex-col lg:items-stretch lg:gap-2.5 lg:border-b-0 lg:px-[26px] lg:py-6"
              >
                {/* Мобайл: иконка в плашке слева от текста, строкой.
                    Десктоп: иконка и заголовок в ОДНОЙ строке, пояснение под
                    ними - поэтому на lg плашка уходит внутрь строки заголовка. */}
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-brand-soft text-brand-ink-deep lg:hidden">
                  {p.icon}
                </span>
                <span className="hidden items-center gap-2.5 lg:flex">
                  <span className="shrink-0 text-brand-ink-deep">{p.icon}</span>
                  <span className="text-[15.5px] font-extrabold text-ink">
                    {p.title}
                  </span>
                </span>
                <span className="min-w-0 flex-1 lg:flex-none">
                  <span className="block text-[15px] font-extrabold text-ink lg:hidden">
                    {p.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-muted lg:hidden">
                    {p.short}
                  </span>
                  <span className="hidden text-[13.5px] leading-relaxed text-muted lg:block">
                    {p.description}
                  </span>
                </span>
                <span className="lg:hidden">
                  <Chevron />
                </span>
              </button>
            ))}
          </div>

          {/* Стартовые колоды */}
          <div className="border-t border-line-soft bg-card-soft px-5 py-5 lg:px-[34px] lg:pt-[26px] lg:pb-8">
            <div className="mb-3.5 text-[14px] font-extrabold text-ink lg:text-[15px]">
              Или начните с готовой колоды
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {STARTER_DECK_PRESETS.map((preset) => {
                const busy = starter.busyPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => void starter.install(preset.id)}
                    disabled={starter.busyPresetId !== null}
                    className="flex min-h-[96px] cursor-pointer flex-col justify-between rounded-[15px] border border-line bg-card px-4 py-3.5 text-left transition-colors hover:border-brand/45 hover:bg-brand-wash disabled:cursor-not-allowed disabled:text-faint-2 disabled:hover:border-line disabled:hover:bg-card"
                  >
                    <span className="block">
                      <span className="block text-[14px] font-extrabold text-ink">
                        {preset.title}
                      </span>
                      <span className="mt-0.5 block text-[13px] font-bold text-brand-ink">
                        {preset.languageName}
                      </span>
                    </span>
                    <span className="mt-3 flex items-center justify-between gap-3 text-[12.5px] font-semibold text-muted">
                      <span>
                        {STARTER_DECK_SIZE}{" "}
                        {plural(
                          STARTER_DECK_SIZE,
                          "карточка",
                          "карточки",
                          "карточек",
                        )}
                      </span>
                      {busy ? <Spinner size={13} /> : <Chevron />}
                    </span>
                  </button>
                );
              })}
            </div>
            {starter.error && (
              <div className="mt-2.5 text-[13px] font-semibold text-again">
                {starter.error}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
