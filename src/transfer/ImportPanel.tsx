import { useEffect, useRef, useState } from "react";
import type { FolderRow } from "@/types";
import { CheckIcon, CloseIcon, UndoIcon } from "@/components/icons";
import { Spinner } from "@/components/Loading";
import { useToast } from "@/components/Toast";
import { TypeBadge } from "@/components/TypeBadge";
import { DESKTOP_QUERY, useMediaQuery } from "@/components/useMediaQuery";
import { FolderPicker } from "@/library/FolderPicker";
import { clozePreview } from "@/study/cloze";
import { plural } from "@/study/format";
import type { PlanRow } from "@/transfer/plan";
import { useImport } from "@/transfer/useImport";

/**
 * Колонка статуса: только исход импорта. Данных словаря здесь больше нет -
 * транскрипцию дотягивает сервер при импорте, и до записи её знать неоткуда
 * (раньше ради неё превью слало запрос на каждое слово колоды).
 */
function StatusCell({ row }: { row: PlanRow }) {
  if (row.duplicate) {
    return (
      <span className="rounded-md bg-hard-soft px-2 py-0.5 text-[11px] font-extrabold text-hard">
        уже есть
      </span>
    );
  }
  return null;
}

/**
 * Промпт, который пользователь отдаёт нейросети. Держим текст здесь, чтобы
 * он не разъезжался с тем, что реально умеет `parseDeck`.
 */
const PROMPT = `Составь колоду для изучения языка в формате JSON:

{
  "version": 1,
  "language": "en",
  "folder": "Название папки",
  "notes": [
    {
      "type": "basic",
      "front": "слово на изучаемом языке",
      "back": "перевод на русский",
      "reverse": true,
      "examples": [
        { "text": "Пример на изучаемом языке.", "translation": "Перевод примера." }
      ],
      "details": "Markdown: часть речи, нюансы, синонимы"
    }
  ]
}

Правила:
- language: "en", "de", "it", "fr" или "es"
- front - само слово, back - перевод (обязателен только он)
- reverse: true - если нужна и обратная карточка RU → EN
- type: "cloze" - предложение с пропуском: "The fox is a {{cunning::хитрый}} animal."
- транскрипцию и аудио НЕ добавляй, приложение подтянет их само

Тема: `;

const EXAMPLE = `{
  "version": 1,
  "language": "en",
  "folder": "Animals",
  "notes": [
    {
      "type": "basic",
      "front": "otter",
      "back": "выдра",
      "reverse": true,
      "examples": [
        { "text": "The otter cracked a shell.", "translation": "Выдра разбила раковину." }
      ]
    },
    {
      "type": "cloze",
      "front": "The fox is a {{cunning::хитрый}} animal.",
      "back": "Лиса - хитрое животное."
    }
  ]
}`;

/** Описание формата: видно, пока файл не выбран. */
function FormatHelp() {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [showExample, setShowExample] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Модалку вполне могут закрыть за те 2 секунды, что висит подтверждение.
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      // Вне secure context (или при отказе в разрешении) промис реджектится -
      // без catch это unhandled rejection и молча не меняющаяся кнопка.
      await navigator.clipboard.writeText(PROMPT);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), 2000);
  };

  return (
    <div className="rounded-[14px] bg-rail px-4 py-3.5">
      <div className="text-[13.5px] leading-relaxed text-muted">
        Попросите нейросеть составить колоду по теме - транскрипцию и озвучку
        приложение добавит само при импорте. Обязателен только перевод.
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="cursor-pointer rounded-[10px] bg-brand px-3.5 py-2 text-[13px] font-bold text-white"
        >
          {copied === "ok"
            ? "Промпт скопирован ✓"
            : copied === "fail"
              ? "Не удалось скопировать"
              : "Скопировать промпт"}
        </button>
        <button
          type="button"
          onClick={() => setShowExample((v) => !v)}
          className="cursor-pointer rounded-[10px] bg-card px-3.5 py-2 text-[13px] font-bold text-muted-2"
        >
          {showExample ? "Скрыть пример" : "Показать пример файла"}
        </button>
      </div>

      {/* Не скопировалось - показываем промпт целиком, чтобы его можно было
          выделить руками, иначе пользователь остаётся ни с чем. */}
      {(showExample || copied === "fail") && (
        <pre className="mt-3 overflow-x-auto rounded-[10px] bg-card p-3 font-mono text-[11.5px] leading-relaxed text-muted select-text">
          {copied === "fail" ? PROMPT : EXAMPLE}
        </pre>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "brand" | "hard";
}) {
  const color =
    tone === "brand"
      ? "text-brand-ink"
      : tone === "hard"
        ? "text-hard"
        : "text-ink";
  return (
    <div className="flex-1 rounded-[14px] bg-card p-3 text-center shadow-card">
      <div className={`text-[22px] font-extrabold ${color}`}>{value}</div>
      <div className="text-[11px] font-semibold text-faint-2">{label}</div>
    </div>
  );
}

/** Откуда берём колоду: файл или вставленный текст. */
type Source = "file" | "paste";

export function ImportPanel({
  folders,
  onClose,
  onImported,
  onCreateFolder,
  pickedFolderId,
}: {
  folders: FolderRow[];
  onClose: () => void;
  onImported: () => void;
  /** Открыть окно создания папки; аргумент - заготовка имени. */
  onCreateFolder: (suggestedName: string) => void;
  /** Папка, только что созданная в том окне, - выбираем её как назначение. */
  pickedFolderId: string | null;
}) {
  const imp = useImport();
  const toast = useToast();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>("file");
  // Текст вставки. Разбор - по кнопке, а не на каждый ввод: иначе недописанный
  // JSON сыпал бы ошибкой на каждом символе.
  const [pasted, setPasted] = useState("");

  // Папка обязательна. Новая создаётся сразу в своём окне (как в форме слова),
  // поэтому к моменту импорта она уже существует и лежит в `folderId`.
  const folderChosen = imp.folderId !== null;

  // Папку завели в окне поверх панели - выбираем её назначением. Эффект здесь
  // по делу: это синхронизация с внешним пропом, а не производное значение.
  const setFolderId = imp.setFolderId;
  useEffect(() => {
    if (pickedFolderId) setFolderId(pickedFolderId);
  }, [pickedFolderId, setFolderId]);

  // Импорт закрывает модалку сразу, а результат сообщает тостом - не держим
  // пользователя на экране «Готово». Ошибка (`ok: false`) оставляет панель
  // открытой: её причина уже показана внутри (`imp.error`).
  const runImport = async () => {
    const result = await imp.run();
    if (!result.ok) return;
    onImported();
    onClose();
    const created = `Импортировано ${result.created} ${plural(result.created, "слово", "слова", "слов")}`;
    const skipped =
      result.skipped > 0
        ? ` · ${result.skipped} ${plural(result.skipped, "дубликат", "дубликата", "дубликатов")} пропущено`
        : "";
    toast.show(created + skipped, "success");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Шапка */}
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 lg:px-7 lg:pt-6">
        <div className="size-9 lg:hidden" aria-hidden />
        <h2 className="flex-1 text-center text-[18px] font-extrabold text-ink lg:text-left lg:text-[22px]">
          Импорт колоды
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-card text-faint-2 shadow-pill"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4 lg:px-7">
        {/* Источник колоды: файл или буфер. Табы, а не две разные модалки -
            поток дальше (папка, превью, запись) общий, и разводить его на два
            экрана значило бы держать две почти одинаковые панели. Пока колода
            не разобрана: после разбора место занимают папка и превью. */}
        {!imp.deck && (
          <div className="flex gap-2 rounded-[14px] bg-rail p-1">
            {(
              [
                { key: "file", label: "Загрузить файл" },
                { key: "paste", label: "Вставить из буфера" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSource(key);
                  // Смена вкладки сбрасывает недоразобранное: ошибка от файла
                  // не должна висеть над полем вставки, и наоборот.
                  setPasted("");
                  imp.reset();
                }}
                aria-pressed={source === key}
                className={`flex-1 cursor-pointer rounded-[11px] py-2.5 text-[13.5px] font-bold transition-colors ${
                  source === key ? "bg-card text-ink shadow-card" : "text-faint"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Файл */}
        {source === "file" && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex cursor-pointer items-center gap-3.5 rounded-[16px] border-[1.5px] border-dashed border-brand/50 bg-card p-4 text-left"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-brand-wash font-mono text-[11px] font-bold text-brand-ink-deep">
                JSON
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-ink">
                  {imp.file?.name ?? "Выбрать файл колоды"}
                </span>
                <span className="block text-[13px] text-faint-2">
                  {imp.deck
                    ? `${imp.deck.notes.length} ${plural(imp.deck.notes.length, "слово", "слова", "слов")} · ${Math.max(1, Math.round((imp.file?.size ?? 0) / 1024))} КБ`
                    : "JSON со списком слов - например, из ChatGPT или Claude"}
                </span>
              </span>
              {imp.deck && (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                  <CheckIcon className="size-3.5" />
                </span>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void imp.load(picked);
                // Сброс: иначе повторный выбор ТОГО ЖЕ файла не даст change.
                e.target.value = "";
              }}
            />
          </>
        )}

        {/* Вставка из буфера */}
        {source === "paste" && !imp.deck && (
          <div className="flex flex-col gap-2">
            <textarea
              // autoFocus только на десктопе: на мобайле фокус поднимает
              // клавиатуру и зумит вьюпорт, сразу пряча половину модалки.
              autoFocus={isDesktop}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder='{ "version": 1, "notes": [ … ] }'
              aria-label="JSON колоды"
              rows={7}
              className="resize-y rounded-[14px] border border-line bg-card px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-hint focus:border-brand"
            />
            <button
              type="button"
              disabled={!pasted.trim()}
              onClick={() => void imp.loadText(pasted)}
              className="cursor-pointer self-start rounded-[10px] bg-brand px-3.5 py-2 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:bg-track disabled:text-faint-2"
            >
              Разобрать
            </button>
          </div>
        )}

        {imp.error && (
          <div className="rounded-[12px] bg-again-soft px-4 py-3 text-[13.5px] font-semibold text-again">
            {imp.error}
          </div>
        )}

        {/* Промпт и формат - общие для обоих табов: колоду просят у нейросети
            одинаково, а принесут её файлом или вставкой - дело вкуса. Подсказка
            нужна ровно до того, как колода разобрана. */}
        {!imp.deck && !imp.error && <FormatHelp />}

        {/* Папка назначения. Тот же `FolderPicker`, что в форме слова: поиск по
            папкам, цветные точки, создание через полноценное окно папки. */}
        {imp.deck && (
          <div>
            <span className="mb-1.5 block text-[11px] font-extrabold tracking-[0.06em] text-label uppercase">
              Папка
            </span>
            <FolderPicker
              folders={folders}
              folderId={imp.folderId}
              onPick={imp.setFolderId}
              // Имя из колоды (§4) - заготовка в окне создания папки, чтобы не
              // перенабирать его руками. Если в списке ничего не искали,
              // подставится оно; набранный запрос имеет приоритет.
              onCreate={(name) =>
                onCreateFolder(name || imp.suggestedFolderName)
              }
            />
          </div>
        )}

        {/* Счётчики */}
        {imp.plan && imp.plan.rows.length > 0 && (
          <div className="flex gap-2.5">
            <Stat value={imp.plan.willImport} label="импортируем" />
            {imp.plan.duplicates > 0 && (
              <Stat value={imp.plan.duplicates} label="дубликаты" tone="hard" />
            )}
          </div>
        )}

        {/* Брак файла */}
        {imp.deck && imp.deck.issues.length > 0 && (
          <div className="rounded-[12px] bg-hard-soft px-4 py-3 text-[13px] text-hard">
            <span className="font-extrabold">
              Пропущено {imp.deck.issues.length}{" "}
              {plural(imp.deck.issues.length, "слово", "слова", "слов")}:
            </span>{" "}
            {imp.deck.issues
              .slice(0, 3)
              .map((i) => `#${i.index + 1} - ${i.reason}`)
              .join("; ")}
            {imp.deck.issues.length > 3 && " …"}
          </div>
        )}

        {/* Превью */}
        {imp.plan && imp.plan.rows.length > 0 && (
          <div className="min-h-0">
            <div className="hidden items-center gap-4 border-b border-line px-3.5 pb-2 text-[11px] font-extrabold tracking-[0.06em] text-label uppercase lg:flex">
              <div className="min-w-0 flex-[1.2]">Слово</div>
              <div className="min-w-0 flex-1">Перевод</div>
              <div className="w-[90px]">Тип</div>
              <div className="w-[130px] text-right">Статус</div>
            </div>
            <ul>
              {imp.plan.rows.map((row, i) => (
                <li
                  key={`${row.note.front}-${i}`}
                  className={`flex items-start gap-3 border-b border-line-faint px-3.5 py-2.5 lg:items-center lg:gap-4 ${
                    row.duplicate ? "bg-hard-soft/40" : ""
                  } ${row.excluded ? "opacity-45" : ""}`}
                >
                  {/* Точка равняется по первой строке (само слово), а не по
                      центру блока: под словом ещё транскрипция и перевод. */}
                  <span
                    className={`mt-2 size-2 shrink-0 rounded-full lg:mt-0 ${row.duplicate ? "bg-hard" : "bg-brand"}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 lg:flex lg:items-center lg:gap-4">
                    <div className="min-w-0 lg:flex-[1.2]">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`truncate text-[15px] font-bold text-ink ${row.excluded ? "line-through" : ""}`}
                        >
                          {row.note.type === "cloze"
                            ? clozePreview(row.note.front)
                            : row.note.front}
                        </span>
                      </div>
                    </div>
                    <div className="truncate text-[13px] text-faint-2 lg:min-w-0 lg:flex-1 lg:text-[14.5px] lg:text-muted">
                      {row.note.back ?? "-"}
                    </div>
                    <div className="hidden w-[90px] shrink-0 lg:block">
                      <TypeBadge
                        type={row.note.type}
                        reverse={row.note.reverse}
                      />
                    </div>
                  </div>
                  <div className="mt-0.5 shrink-0 text-right lg:mt-0 lg:w-[130px]">
                    <StatusCell row={row} />
                  </div>
                  {/* Убрать/вернуть строку. Дубликаты и так не импортируются -
                      им переключатель не нужен. */}
                  {!row.duplicate && (
                    <button
                      type="button"
                      onClick={() => imp.toggleExclude(i)}
                      aria-pressed={row.excluded}
                      aria-label={
                        row.excluded
                          ? `Вернуть ${row.note.front} в импорт`
                          : `Убрать ${row.note.front} из импорта`
                      }
                      title={row.excluded ? "Вернуть" : "Убрать из импорта"}
                      className="mt-0.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-faint-2 transition-colors hover:bg-rail hover:text-hard lg:mt-0"
                    >
                      {row.excluded ? (
                        <UndoIcon className="size-4" />
                      ) : (
                        <CloseIcon className="size-3.5" />
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Подвал */}
      <div className="border-t border-line bg-card px-5 py-4 lg:px-7">
        <div className="flex items-center justify-between gap-4">
          <span className="hidden text-[13px] font-semibold text-faint lg:block">
            {imp.deck && !folderChosen
              ? "Выберите папку для импорта"
              : "Дубликаты пропускаются · транскрипция и озвучка добавятся после импорта"}
          </span>
          <button
            type="button"
            disabled={
              !imp.plan ||
              imp.plan.willImport === 0 ||
              imp.stage.kind !== "ready" ||
              !folderChosen
            }
            onClick={() => void runImport()}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-brand px-6 py-3.5 text-[15px] font-extrabold text-white shadow-brand disabled:cursor-not-allowed disabled:bg-track disabled:text-faint-2 disabled:shadow-none lg:w-auto lg:py-3 lg:text-[14px]"
          >
            {imp.stage.kind === "importing" && <Spinner size={16} />}
            {imp.stage.kind === "importing"
              ? "Импорт…"
              : imp.plan
                ? `Импортировать ${imp.plan.willImport}`
                : "Импортировать"}
          </button>
        </div>
      </div>
    </div>
  );
}
