import { useEffect, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { CardRow, NoteRow } from "@/types";
import { InfoIcon, PlayIcon } from "@/components/icons";
import { fieldCls } from "@/components/formStyles";
import { parseCloze } from "@/study/cloze";
import { promptSizeCls } from "@/study/promptSize";
import { cardSpeakSource, type SpeakSource } from "@/speech/audioSource";
import { DetailsPanel, DETAILS_LABEL } from "@/study/DetailsPanel";
import { useSpeechContext } from "@/speech/useSpeechContext";
import { Spinner } from "@/components/Loading";
import { normalizeStudyLanguage } from "@/speech/languages";
import {
  answerForExercise,
  letterTiles,
  normalizeAnswer,
  typedExpectedAnswer,
  type ChoiceOption,
  type ExerciseKind,
} from "@/study/exercises";

const DIRECTION_LABEL: Record<CardRow["direction"], string> = {
  forward: "EN → RU",
  reverse: "RU → EN",
  cloze: "ПРОПУСК",
};

/**
 * Кнопка info: одна на оба типа карточек. Раньше обычная карточка и cloze
 * рисовали её по отдельности, и они разъехались - формой (иконка против
 * кнопки с подписью внизу) и текстом («нюансы» против «синонимов»).
 */
function DetailsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={DETAILS_LABEL}
      title={DETAILS_LABEL}
      className="ml-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-track text-faint hover:text-ink"
    >
      <InfoIcon className="size-4" />
    </button>
  );
}

/**
 * Кнопка озвучки ГЛАВНОГО слова: принимает источник (§6) - живой голос словаря
 * с фолбэком на синтез. Примеры озвучиваются `SpeakInline` через TTS: словарное
 * аудио записано под слово заметки, а не под произвольное предложение.
 *
 * `onClick` останавливает всплытие: вся карточка - это одна большая кнопка
 * переворота, и без `stopPropagation` озвучка заодно раскрывала бы ответ.
 */
function SpeakButton({
  source,
  onPlay,
  size = "lg",
}: {
  source: SpeakSource;
  onPlay: (source: SpeakSource) => void;
  size?: "lg" | "sm";
}) {
  const lg = size === "lg";
  // Ждём облако - показываем это на самой кнопке (см. `SpeakInline`).
  // У слова с живой записью OneLook ожидания нет: там играет mp3 напрямую.
  const { pendingText } = useSpeechContext();
  const loading = pendingText === source.text;

  // Отклик на нажатие - как у `SpeakInline`: при попадании в кэш звук идёт
  // мгновенно, и без этого на мобиле непонятно, засчитался ли тап.
  const [hit, setHit] = useState(false);
  useEffect(() => {
    if (!hit) return;
    const t = setTimeout(() => setHit(false), 450);
    return () => clearTimeout(t);
  }, [hit]);

  return (
    <button
      type="button"
      aria-label="Озвучить"
      aria-busy={loading}
      onClick={(e) => {
        e.stopPropagation();
        setHit(true);
        onPlay(source);
      }}
      className={`flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-white transition-transform duration-150 active:scale-90 ${
        hit || loading ? "scale-105 brightness-110" : ""
      } ${lg ? "size-14 shadow-fab lg:size-[54px]" : "size-9"}`}
    >
      {loading ? (
        <Spinner size={lg ? 24 : 16} />
      ) : (
        <PlayIcon className={lg ? "size-6" : "size-4"} />
      )}
    </button>
  );
}

/**
 * Компактная озвучка для примеров: не залитый зелёный круг (как `SpeakButton`),
 * а лёгкая ghost-иконка. При нескольких примерах ряд больших кнопок нагромождал
 * бы карточку - здесь икон приглушён и зеленеет только при наведении.
 */
function SpeakInline({
  text,
  onSpeak,
}: {
  text: string;
  onSpeak: (text: string) => void;
}) {
  // Облачный синтез отвечает секунды, и без отклика клик выглядит как «не
  // нажалось». Сравниваем с текстом, а не держим булев флаг: озвучка одна на
  // приложение, и флаг зажёг бы лоадеры на всех кнопках разом.
  const { pendingText } = useSpeechContext();
  const loading = pendingText === text;

  // Короткая подсветка сразу после нажатия. Одного лоадера мало: при попадании
  // в кэш (а после прогрева это обычный случай) звук идёт мгновенно,
  // `pendingText` не успевает выставиться, и на мобиле кнопка выглядела
  // полностью безответной - `hover:` там не существует, а `active:scale-95` на
  // иконке 28px глазом не читается.
  const [hit, setHit] = useState(false);
  useEffect(() => {
    if (!hit) return;
    const t = setTimeout(() => setHit(false), 450);
    return () => clearTimeout(t);
  }, [hit]);

  // Пока ждём синтез, подсветка держится: лоадер и так виден, но фон не должен
  // моргать между «нажал» и «поехало».
  const lit = hit || loading;

  return (
    <button
      type="button"
      aria-label="Озвучить пример"
      aria-busy={loading}
      onClick={(e) => {
        e.stopPropagation();
        setHit(true);
        onSpeak(text);
      }}
      // `before:` растягивает область нажатия до 44px (минимум Apple HIG),
      // не трогая видимый размер: сама иконка в ряду примеров должна остаться
      // некрупной, иначе она перетянет внимание с текста. До этого палец
      // попадал в 31px, и часть тапов просто пролетала мимо - что читалось
      // как «кнопка не реагирует».
      className={`relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] active:scale-90 ${
        lit
          ? "scale-110 bg-brand-soft text-brand"
          : "text-faint hover:bg-brand-tint hover:text-brand"
      }`}
    >
      {loading ? <Spinner size={14} /> : <PlayIcon className="size-3.5" />}
    </button>
  );
}

/**
 * Пропуск на лице cloze-карточки: пустой подчёркнутый слот. Русская подсказка
 * (если есть) - маленький чип НАД слотом, а не текст внутри него: так ясно, что
 * это намёк, а сам пропуск читается как пустое место, которое надо заполнить.
 */
function ClozeBlank({ hint }: { hint?: string }) {
  // Самодостаточный inline-токен на базовой линии - никаких absolute-слоёв, что
  // при переносе строк давали кривизну и налезание. Есть подсказка - это тинт-
  // пилюля с русским намёком (мелкий, приглушённый - явно не ответ). Нет - пустой
  // подчёркнутый слот той же высоты. Ставим на базовую линию текста вокруг.
  const boxCls =
    "mx-1 inline-flex min-w-16 items-center justify-center rounded-lg align-baseline";
  if (hint) {
    return (
      <span
        className={`${boxCls} bg-brand-tint px-2.5 py-0.5 text-[0.62em] font-semibold text-brand-ink`}
      >
        {hint}
      </span>
    );
  }
  return (
    <span className={`${boxCls} w-24 border-b-[3px] border-brand`}>
      &#8203;
    </span>
  );
}

function Transcription({ value }: { value: string | null }) {
  if (!value) return null;
  return <span className="text-hint font-medium">{value}</span>;
}

function AnswerDiff({
  expected,
  actual,
}: {
  expected: string;
  actual: string;
}) {
  const expectedWords = expected.trim().split(/\s+/).filter(Boolean);
  const actualWords = actual.trim().split(/\s+/).filter(Boolean);

  const rendered = actualWords.map((word, wordIndex) => {
    const expectedWord = expectedWords[wordIndex];
    if (!expectedWord) {
      return (
        <span key={wordIndex} className="text-again line-through decoration-2">
          {word}
        </span>
      );
    }
    if (normalizeAnswer(word) === normalizeAnswer(expectedWord)) {
      return <span key={wordIndex}>{word}</span>;
    }

    const sameShape =
      actualWords.length === expectedWords.length &&
      Math.abs(word.length - expectedWord.length) <= 2;

    if (!sameShape) {
      return (
        <span key={wordIndex} className="text-again line-through decoration-2">
          {word}
        </span>
      );
    }

    return (
      <span key={wordIndex}>
        {[...word].map((char, charIndex) => {
          const bad =
            normalizeAnswer(char) !==
            normalizeAnswer(expectedWord[charIndex] ?? "");
          return (
            <span
              key={charIndex}
              className={
                bad
                  ? "rounded-[3px] bg-hard-soft px-0.5 text-hard underline decoration-hard decoration-2 underline-offset-4"
                  : undefined
              }
            >
              {char}
            </span>
          );
        })}
      </span>
    );
  });

  return (
    <div className="mt-4 grid gap-2 rounded-[18px] border border-line bg-card-soft p-3.5 lg:grid-cols-2">
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold tracking-[0.06em] text-label uppercase">
          Верный ответ
        </div>
        <div className="mt-1 break-words text-[16px] font-extrabold text-ink">
          {expected}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold tracking-[0.06em] text-label uppercase">
          Ваш ответ
        </div>
        <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-1 break-words text-[16px] font-extrabold text-ink">
          {rendered}
          {actualWords.length < expectedWords.length && (
            <span className="text-hard underline decoration-hard decoration-2 underline-offset-4">
              …
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TypedAnswer({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value?: string) => void;
}) {
  return (
    <div className="w-full px-4 pb-4">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key !== "Enter") return;
          e.preventDefault();
          onSubmit();
        }}
        aria-label="Напишите ответ"
        placeholder="Напишите ответ"
        className={fieldCls}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
      />
    </div>
  );
}

function ExerciseHint({ children }: { children: string }) {
  return (
    <div className="rounded-pill bg-brand-soft px-3 py-1.5 text-[11px] font-extrabold tracking-[0.05em] text-brand-ink uppercase">
      {children}
    </div>
  );
}

function ChoiceExercise({
  prompt,
  options,
  onChoose,
}: {
  prompt: string;
  options: ChoiceOption[];
  onChoose: (option: ChoiceOption) => void;
}) {
  return (
    <div className="flex w-full flex-1 flex-col justify-center gap-6 px-6 py-6 text-center lg:px-10 lg:py-8">
      <div>
        <p
          className={`leading-tight font-extrabold break-words text-ink ${promptSizeCls(prompt)}`}
        >
          {prompt}
        </p>
      </div>
      <div className="grid gap-2 text-left">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChoose(option);
            }}
            className="min-h-[52px] cursor-pointer rounded-[14px] border border-line bg-card-soft px-4 py-3 text-[15px] font-bold text-ink transition-colors hover:border-brand hover:bg-brand-tint"
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function AudioWriteExercise({
  answer,
  value,
  onChange,
  onSubmit,
  onPlay,
  note,
}: {
  answer: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value?: string) => void;
  onPlay: (source: SpeakSource) => void;
  note: NoteRow;
}) {
  const source: SpeakSource = {
    url: null,
    text: answer,
    language: normalizeStudyLanguage(note.study_language),
    cloud: true,
  };
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-5 px-6 text-center lg:px-10">
      <ExerciseHint>На слух</ExerciseHint>
      <SpeakButton source={source} onPlay={onPlay} />
      <p className="text-[15px] font-semibold text-faint">
        Прослушайте и напишите слово
      </p>
      <TypedAnswer value={value} onChange={onChange} onSubmit={onSubmit} />
    </div>
  );
}

function LetterExercise({
  answer,
  prompt,
  value,
  onChange,
  onSubmit,
}: {
  answer: string;
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value?: string) => void;
}) {
  const compactAnswer = answer.replace(/\s+/g, "");
  const tiles = letterTiles(answer);
  const [picked, setPicked] = useState<number[]>([]);
  const renderedValue = picked.map((i) => tiles[i]).join("");
  return (
    <div className="flex w-full flex-1 flex-col justify-center gap-5 px-6 text-center lg:px-10">
      <div>
        <ExerciseHint>Соберите слово</ExerciseHint>
        {prompt && (
          <p className="mt-4 text-[18px] font-bold text-ink">{prompt}</p>
        )}
      </div>
      <div className="min-h-[48px] rounded-[14px] border border-line bg-card-soft px-4 py-3 font-mono text-[22px] font-bold tracking-[0.08em] text-ink">
        {renderedValue || <span className="text-hint">...</span>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {tiles.map((char, i) => {
          const used = picked.includes(i);
          return (
            <button
              key={`${char}-${i}`}
              type="button"
              disabled={used}
              onClick={(e) => {
                e.stopPropagation();
                const pickedNext = [...picked, i];
                const next = pickedNext
                  .map((tileIndex) => tiles[tileIndex])
                  .join("");
                setPicked(pickedNext);
                onChange(next);
                if (normalizeAnswer(next) === normalizeAnswer(compactAnswer))
                  onSubmit(next);
              }}
              className="flex size-11 cursor-pointer items-center justify-center rounded-[12px] border border-line bg-card text-[18px] font-extrabold text-ink shadow-card disabled:cursor-not-allowed disabled:opacity-25"
            >
              {char}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const pickedNext = picked.slice(0, -1);
            setPicked(pickedNext);
            onChange(pickedNext.map((tileIndex) => tiles[tileIndex]).join(""));
          }}
          className="cursor-pointer rounded-[13px] bg-rail px-4 py-3 text-[13px] font-bold text-muted-2"
        >
          Стереть
        </button>
        <button
          type="button"
          disabled={!value}
          onClick={(e) => {
            e.stopPropagation();
            onSubmit(value);
          }}
          className="cursor-pointer rounded-[13px] bg-brand px-4 py-3 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:bg-brand-muted"
        >
          Проверить
        </button>
      </div>
    </div>
  );
}

/** Лицо карточки - зависит от направления. */
function CardFront({
  card,
  note,
  hidden,
  typedAnswer,
  typedAnswerEnabled,
  exerciseKind,
  answerChoices,
  exampleChoices,
  onTypedAnswerChange,
  onTypedAnswerSubmit,
  onPlay,
}: {
  card: CardRow;
  note: NoteRow;
  hidden: boolean;
  typedAnswer: string;
  typedAnswerEnabled: boolean;
  exerciseKind: ExerciseKind;
  answerChoices: ChoiceOption[];
  exampleChoices: ChoiceOption[];
  onTypedAnswerChange: (value: string) => void;
  onTypedAnswerSubmit: (value?: string) => void;
  onPlay: (source: SpeakSource) => void;
}) {
  const isCloze = card.direction === "cloze";
  const prompt = card.direction === "reverse" ? (note.back ?? "") : note.front;
  // Для cloze озвучивается предложение целиком (без разметки пропусков), для
  // forward - само слово; что именно и каким голосом, решает `cardSpeakSource`.
  const source = cardSpeakSource(note, card.direction);

  return (
    <div
      inert={hidden}
      className="col-start-1 row-start-1 flex min-h-[380px] flex-col items-center rounded-card-lg bg-card pt-7 shadow-flip [backface-visibility:hidden] lg:rounded-[26px] lg:pt-10"
    >
      <div className="w-full px-7 lg:px-10">
        <span className="self-start rounded-pill bg-brand-soft px-3 py-1.5 text-[11px] font-extrabold tracking-[0.05em] text-brand-ink">
          {exerciseKind === "flashcard"
            ? DIRECTION_LABEL[card.direction]
            : "ТРЕНАЖЁР"}
        </span>
      </div>

      {exerciseKind === "choice" && answerChoices.length >= 2 ? (
        <ChoiceExercise
          prompt={prompt}
          options={answerChoices}
          onChoose={(option) => {
            onTypedAnswerChange(option.text);
            onTypedAnswerSubmit(option.text);
          }}
        />
      ) : exerciseKind === "example" && exampleChoices.length >= 2 ? (
        <ChoiceExercise
          prompt={`Где правильно используется «${note.front}»?`}
          options={exampleChoices}
          onChoose={(option) => {
            onTypedAnswerChange(option.text);
            onTypedAnswerSubmit(option.text);
          }}
        />
      ) : exerciseKind === "audio" ? (
        <AudioWriteExercise
          answer={answerForExercise(exerciseKind, card, note)}
          value={typedAnswer}
          onChange={onTypedAnswerChange}
          onSubmit={onTypedAnswerSubmit}
          onPlay={onPlay}
          note={note}
        />
      ) : exerciseKind === "letters" ? (
        <LetterExercise
          answer={answerForExercise(exerciseKind, card, note)}
          prompt={note.back ?? ""}
          value={typedAnswer}
          onChange={onTypedAnswerChange}
          onSubmit={onTypedAnswerSubmit}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-7 text-center lg:px-10">
          {isCloze ? (
            <p className="text-2xl leading-relaxed font-bold text-ink lg:text-[32px] lg:leading-relaxed">
              {parseCloze(note.front).map((seg, i) =>
                seg.blank ? (
                  <ClozeBlank key={i} hint={seg.hint} />
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </p>
          ) : (
            <p
              className={`leading-tight font-extrabold break-words text-ink ${promptSizeCls(prompt)}`}
            >
              {prompt}
            </p>
          )}

          {/* Озвучка - только для изучаемой стороны */}
          {card.direction !== "reverse" && (
            <div className="flex flex-col items-center gap-4 lg:flex-row lg:gap-4">
              <SpeakButton source={source} onPlay={onPlay} />
              <Transcription value={note.transcription} />
            </div>
          )}
        </div>
      )}

      {typedAnswerEnabled && (
        <TypedAnswer
          value={typedAnswer}
          onChange={onTypedAnswerChange}
          onSubmit={onTypedAnswerSubmit}
        />
      )}
    </div>
  );
}

/** Оборот карточки - зависит от направления. */
function CardBack({
  card,
  note,
  hidden,
  onSpeak,
  onPlay,
  onOpenDetails,
  typedAnswer,
  exerciseKind,
  exampleChoices,
}: {
  card: CardRow;
  note: NoteRow;
  hidden: boolean;
  /** Озвучка примеров - всегда синтез (словарное аудио записано под слово). */
  onSpeak: (text: string) => void;
  onPlay: (source: SpeakSource) => void;
  onOpenDetails: () => void;
  typedAnswer: string | null;
  exerciseKind: ExerciseKind;
  exampleChoices: ChoiceOption[];
}) {
  const source = cardSpeakSource(note, card.direction);
  const expectedTypedAnswer =
    exerciseKind === "example"
      ? (exampleChoices.find((option) => option.correct)?.text ??
        typedExpectedAnswer(card, note))
      : answerForExercise(exerciseKind, card, note);
  return (
    // `inert` (а не только aria-hidden): убирает невидимую сторону и из
    // скринридера, и из поиска по странице, и из таб-порядка - иначе ответ
    // читается до переворота.
    <div
      inert={hidden}
      className="col-start-1 row-start-1 flex min-h-[380px] flex-col overflow-y-auto rounded-card-lg bg-card p-6 shadow-flip [backface-visibility:hidden] [transform:rotateY(180deg)] lg:rounded-[26px] lg:p-8"
    >
      {card.direction === "cloze" ? (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xl leading-relaxed font-bold text-ink lg:text-2xl lg:leading-relaxed">
            {parseCloze(note.front).map((seg, i) =>
              seg.blank ? (
                // Разгаданный пропуск подсвечиваем чипом, а не только цветом:
                // так сразу видно, что именно было пропущено.
                <span
                  key={i}
                  className="mx-0.5 rounded-md bg-brand-soft px-1.5 py-0.5 font-extrabold text-brand-ink-deep"
                >
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </p>
          <SpeakButton source={source} onPlay={onPlay} size="sm" />
          {note.details && <DetailsButton onOpen={onOpenDetails} />}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-[26px] font-extrabold text-ink lg:text-[38px]">
            {note.front}
          </span>
          <SpeakButton source={source} onPlay={onPlay} size="sm" />
          <Transcription value={note.transcription} />
          {note.details && <DetailsButton onOpen={onOpenDetails} />}
        </div>
      )}

      {typedAnswer && expectedTypedAnswer && (
        <AnswerDiff expected={expectedTypedAnswer} actual={typedAnswer} />
      )}

      {/* Перевод */}
      {note.back && (
        <div className="mt-4 rounded-[18px] bg-brand-tint px-4 py-4">
          <p className="text-lg font-bold text-ink lg:text-2xl">{note.back}</p>
        </div>
      )}

      {note.examples.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-extrabold tracking-[0.06em] text-label uppercase">
            {note.examples.length > 1 ? "Примеры" : "Пример"}
          </p>
          <ul className="flex flex-col gap-3">
            {note.examples.map((example, i) => (
              <li key={i} className="flex items-start gap-2">
                {/* Иконка озвучки - маленькая ghost-кнопка у каждого примера,
                    чтобы ряд не нагромождался при нескольких примерах. */}
                <SpeakInline text={example.text} onSpeak={onSpeak} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15.5px] leading-relaxed text-ink-2">
                    {example.text}
                  </p>
                  {example.translation && (
                    <p className="mt-0.5 text-sm leading-relaxed text-faint-2">
                      {example.translation}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function StudyCard({
  card,
  note,
  revealed,
  typedAnswerEnabled = false,
  exerciseKind = "flashcard",
  answerChoices = [],
  exampleChoices = [],
  onFlip,
  onSpeak,
  onPlay,
}: {
  card: CardRow;
  note: NoteRow;
  revealed: boolean;
  typedAnswerEnabled?: boolean;
  exerciseKind?: ExerciseKind;
  answerChoices?: ChoiceOption[];
  exampleChoices?: ChoiceOption[];
  onFlip: () => void;
  /** Синтез произвольного текста - для примеров. */
  onSpeak: (text: string) => void;
  /** Озвучка главного слова: живой голос словаря с фолбэком на синтез. */
  onPlay: (source: SpeakSource) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");

  const revealFromTypedAnswer = (value = typedAnswer) => {
    if (value.trim().length === 0) return;
    onFlip();
  };

  return (
    <div className="[perspective:1700px] flex-1 lg:min-h-[380px] lg:w-[560px] lg:flex-none">
      {/* Ключ по карточке: следующая карточка монтируется новым узлом, поэтому ей
          не от чего анимировать разворот назад. Появление живёт на обёртке -
          на самом флипе оно перебивало бы transform переворота. */}
      <motion.div
        key={card.id}
        className="relative h-full"
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Не `<button>`: внутри карточки - свои кнопки озвучки, а кнопка в
            кнопке невалидна (ошибка вложенности + гидратации). Поэтому
            `role="button"` на div. Раскрытие только в одну сторону (назад не
            переворачиваем - оценивают), так что после reveal роль снимаем:
            активировать больше нечего.
            Клавиатура - только Enter: Space на раскрытие уже висит глобально
            в `useStudyHotkeys`, дублировать его здесь значит обработать нажатие
            дважды, когда фокус на карточке. */}
        <div
          {...(revealed || typedAnswerEnabled
            ? {}
            : {
                role: "button",
                tabIndex: 0,
                onClick: onFlip,
                onKeyDown: (e: KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onFlip();
                  }
                },
                "aria-label": "Показать ответ",
              })}
          className={`grid min-h-full text-left [transform-style:preserve-3d] transition-transform duration-[550ms] ease-[cubic-bezier(.4,0,.2,1)] ${revealed ? "" : "cursor-pointer"}`}
          style={{ transform: revealed ? "rotateY(180deg)" : undefined }}
        >
          <CardFront
            card={card}
            note={note}
            hidden={revealed}
            typedAnswer={typedAnswer}
            typedAnswerEnabled={typedAnswerEnabled}
            exerciseKind={exerciseKind}
            answerChoices={answerChoices}
            exampleChoices={exampleChoices}
            onTypedAnswerChange={setTypedAnswer}
            onTypedAnswerSubmit={revealFromTypedAnswer}
            onPlay={onPlay}
          />
          <CardBack
            card={card}
            note={note}
            hidden={!revealed}
            onSpeak={onSpeak}
            onPlay={onPlay}
            onOpenDetails={() => setDetailsOpen(true)}
            typedAnswer={typedAnswer.trim() ? typedAnswer : null}
            exerciseKind={exerciseKind}
            exampleChoices={exampleChoices}
          />
        </div>

        {/* Панель `details` - поверх карточки, вне флипа (тот повёрнут на 180°).
            Живёт на том же слое, что и обёртка появления. */}
        <AnimatePresence>
          {detailsOpen && revealed && note.details && (
            <DetailsPanel
              markdown={note.details}
              onClose={() => setDetailsOpen(false)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
