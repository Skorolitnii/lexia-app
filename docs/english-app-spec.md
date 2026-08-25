# Приложение для изучения английского - итоговая спецификация и план реализации

Персональное PWA-приложение для изучения английского: карточки с интервальным повторением (FSRS), озвучка, папки, импорт колод, сгенерированных нейросетью. Документ фиксирует все решения, принятые в ходе проектирования, и служит планом реализации.

---

## 1. Контекст и ограничения

- **Один пользователь, два устройства:** десктоп (Chrome) и iPhone. На iOS все браузеры, включая Chrome, работают на движке WebKit, поэтому Chrome на айфоне ведёт себя как Safari.
- **Распознавание речи - вне MVP.** `SpeechRecognition` существует в Safari-вкладке на iOS, но не работает в установленной PWA (домашний экран). Так как приложение ставится как PWA, фича произношения отложена. Вернём её позже через запись `MediaRecorder` + облачный STT/сервис оценки произношения (это заодно решит и то, что сравнение строк не измеряет реальное произношение).
- **TTS работает** на iOS, в том числе офлайн на встроенных голосах - озвучка остаётся.
- **Нет Background Sync на iOS** - синхронизация между устройствами происходит только при открытом приложении, не в фоне.
- **Цель проекта:** реализовать работающее приложение. Бэкенд без глубокого серверного кода - Supabase как BaaS закрывает хранение, авторизацию и синк.

---

## 2. Стек (зафиксирован)

| Слой | Выбор | Роль |
|---|---|---|
| Сборка | Vite + React + TypeScript | основа |
| Состояние + локальное хранилище + синк | **Legend-State** (`syncedSupabase`, персистенция в IndexedDB) | единый слой данных, заменяет и Dexie, и отдельный стейт-менеджер |
| Бэкенд/БД | **Supabase** - Postgres + Auth (magic link) + RLS + Storage | хранение, авторизация, картинки |
| Расписание | **ts-fsrs** | алгоритм FSRS |
| PWA | **vite-plugin-pwa** | установка, офлайн, прекэш |
| UI | **Tailwind CSS** + токены дизайна (без UI-кита) | стилизация; headless-примитивы (Radix/react-aria) и `react-hotkeys-hook` точечно по мере надобности |
| Markdown | **react-markdown** (+ санитизация) | info-панель карточки |
| Сетевые запросы словаря | **React Query** | только Datamuse API |
| Графики | **Recharts** | статистика |

**Почему Legend-State, а не «настоящий» sync-движок:** для одного пользователя с крошечным датасетом и неодновременными правками достаточно last-write-wins. Legend-State работает поверх `supabase-js`, поэтому RLS применяется напрямую и не требует отдельного сервиса. Известный нюанс: при долгом офлайне и переподключении возможны пропуски до ручного рефреша - закладываем кнопку ручной синхронизации.

---

## 3. Модель данных

Из-за обратных карточек (EN→RU и RU→EN - разные навыки с независимым расписанием) контент и расписание разделены:

- **Заметка (note)** - общий контент: слово, перевод, транскрипция, аудио, info-панель, примеры, картинка, папка, тип. Её *редактируешь*.
- **Карточка (card)** - конкретное направление (`forward` / `reverse` / `cloze`) со своим состоянием FSRS. Её *учишь*. Одна заметка порождает 1–2 карточки.

Иерархия: `folders → notes → cards → review_logs` (+ `settings`).

### Правило порождения карточек

- `basic` без обратной → 1 карточка (`forward`, EN→RU)
- `basic` с обратной (`reverse: true`) → 2 карточки (`forward` + `reverse`)
- `cloze` → 1 карточка (`cloze`), обратной нет

### Поведение, которое надо соблюдать

- Редактирование контента заметки **не сбрасывает** FSRS-состояние её карточек.
- Переключение `reverse` off→on создаёт reverse-карточку с нуля; on→off мягко удаляет её, не трогая forward.
- Удаление заметки = soft-delete заметки и её карточек.

### SQL-схема (финальная)

```sql
-- ПАПКИ (плоские, одна на заметку)
create table folders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- ЗАМЕТКИ (общий контент)
create table notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  type text not null default 'basic' check (type in ('basic','cloze')),
  front text not null,                  -- EN-слово/фраза либо предложение с {{cloze}}
  back text,                            -- перевод (RU)
  transcription text,                   -- IPA, дотягивается из Datamuse
  audio_url text,                       -- passthrough для импорта чужого JSON;
                                        -- passthrough; своя озвучка синтезируется облаком по тексту
  image_url text,                       -- картинка к карточке; источник - image-API (выбрать позже)
  details text,                         -- Markdown: грамматика, нюансы, синонимы
  examples jsonb not null default '[]', -- [{text, translation}]
  reverse boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index notes_folder_idx on notes (user_id, folder_id) where deleted = false;

-- КАРТОЧКИ (направление + состояние FSRS)
create table cards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id uuid not null references notes(id) on delete cascade,
  direction text not null check (direction in ('forward','reverse','cloze')),
  due timestamptz not null,
  stability double precision not null,
  difficulty double precision not null,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0,    -- 0 New /1 Learning /2 Review /3 Relearning
  last_review timestamptz,
  learning_steps integer not null default 0,  -- сверить с версией ts-fsrs; нет поля -> убрать колонку
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  unique (note_id, direction)
);
create index cards_due_idx on cards (user_id, due)
  where deleted = false and suspended = false;

-- ЖУРНАЛ ПОВТОРЕНИЙ (append-only)
create table review_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  rating smallint not null,
  state smallint not null,
  due timestamptz,
  stability double precision,
  difficulty double precision,
  elapsed_days integer,
  last_elapsed_days integer,
  scheduled_days integer,
  review timestamptz not null,
  created_at timestamptz not null default now()
);
create index review_logs_activity_idx on review_logs (user_id, review);

-- НАСТРОЙКИ (одна строка на пользователя)
create table settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  new_cards_per_day integer not null default 20,
  bury_siblings boolean not null default false,
  tts_voice text,
  tts_rate double precision not null default 1.0,
  audio_region text not null default 'us' check (audio_region in ('us','uk')),
  updated_at timestamptz not null default now()
);
```

### Триггер `updated_at`

Нужен, чтобы инкрементальный синк Legend-State (`changesSince: 'last-sync'`) работал корректно при расхождении часов между устройствами - `updated_at` владеет сервер.

```sql
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger folders_updated_at  before update on folders  for each row execute function set_updated_at();
create trigger notes_updated_at    before update on notes    for each row execute function set_updated_at();
create trigger cards_updated_at    before update on cards    for each row execute function set_updated_at();
create trigger settings_updated_at before update on settings for each row execute function set_updated_at();
```

### RLS

`using` фильтрует видимые/затрагиваемые строки; `with check` валидирует значения новой/изменённой строки. Паттерн `auth.uid() = user_id` на всех таблицах:

```sql
alter table folders enable row level security;
alter table notes enable row level security;
alter table cards enable row level security;
alter table review_logs enable row level security;
alter table settings enable row level security;

-- folders / notes / cards / settings: select + insert + update (пример для notes)
create policy notes_select on notes for select using (auth.uid() = user_id);
create policy notes_insert on notes for insert with check (auth.uid() = user_id);
create policy notes_update on notes for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- идентично для folders, cards, settings

-- review_logs: только select + insert (журнал неизменяем)
create policy logs_select on review_logs for select using (auth.uid() = user_id);
create policy logs_insert on review_logs for insert with check (auth.uid() = user_id);
```

### TypeScript-типы

```ts
import { type Card as FsrsCard, State } from 'ts-fsrs'

export interface Example { text: string; translation?: string }
export type Direction = 'forward' | 'reverse' | 'cloze'

export interface NoteRow {
  id: string; user_id: string; folder_id: string | null
  type: 'basic' | 'cloze'
  front: string; back: string | null
  transcription: string | null; audio_url: string | null
  details: string | null
  examples: Example[]
  reverse: boolean
  tags: string[]
  created_at: string; updated_at: string; deleted: boolean
}

export interface CardRow {
  id: string; user_id: string; note_id: string; direction: Direction
  due: string; stability: number; difficulty: number
  elapsed_days: number; scheduled_days: number; reps: number; lapses: number
  state: State; last_review: string | null; learning_steps: number
  suspended: boolean
  created_at: string; updated_at: string; deleted: boolean
}
```

### Мост между строкой и ts-fsrs

Главный источник багов - граница «строка ↔ FSRS»: Supabase/JSON хранят даты ISO-строками, а ts-fsrs оперирует объектами `Date`. Конвертировать на границе.

```ts
import { createEmptyCard, fsrs, Rating, type Card as FsrsCard } from 'ts-fsrs'

export const scheduler = fsrs({ enable_fuzz: true, enable_short_term: true })

export function rowToFsrs(row: CardRow): FsrsCard {
  return {
    due: new Date(row.due),
    stability: row.stability, difficulty: row.difficulty,
    elapsed_days: row.elapsed_days, scheduled_days: row.scheduled_days,
    reps: row.reps, lapses: row.lapses, state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
    learning_steps: row.learning_steps,
  } as FsrsCard
}

export function fsrsToPatch(c: FsrsCard) {
  return {
    due: c.due.toISOString(),
    stability: c.stability, difficulty: c.difficulty,
    elapsed_days: c.elapsed_days, scheduled_days: c.scheduled_days,
    reps: c.reps, lapses: c.lapses, state: c.state,
    last_review: c.last_review ? new Date(c.last_review).toISOString() : null,
    learning_steps: (c as any).learning_steps ?? 0,
  }
}

function directionsFor(n: NoteRow): Direction[] {
  if (n.type === 'cloze') return ['cloze']
  return n.reverse ? ['forward', 'reverse'] : ['forward']
}

export function buildCardsForNote(n: NoteRow): Omit<CardRow,'user_id'>[] {
  const now = new Date().toISOString()
  return directionsFor(n).map(direction => ({
    id: crypto.randomUUID(), note_id: n.id, direction,
    ...fsrsToPatch(createEmptyCard()),
    suspended: false, created_at: now, updated_at: now, deleted: false,
  }))
}

export function applyReview(card: CardRow, rating: Rating, now = new Date()) {
  const { card: next, log } = scheduler.next(rowToFsrs(card), now, rating)
  return {
    cardPatch: fsrsToPatch(next),
    logRow: {
      id: crypto.randomUUID(), card_id: card.id,
      rating: log.rating, state: log.state,
      due: log.due.toISOString(),
      stability: log.stability, difficulty: log.difficulty,
      elapsed_days: log.elapsed_days, last_elapsed_days: log.last_elapsed_days,
      scheduled_days: log.scheduled_days, review: log.review.toISOString(),
    },
  }
}
```

### Очередь на изучение (in-memory, без серверного запроса)

```ts
const dueQueue = cards.filter(c =>
  !c.deleted && !c.suspended &&
  new Date(c.due) <= now &&
  scopeFolderIds.includes(notesById[c.note_id]?.folder_id ?? '')
)
// новые (state === State.New) ограничить settings.new_cards_per_day, затем перемешать
```

---

## 4. Формат импорта (файл от нейросети)

**Разделение труда:** нейросеть делает то, что умеет (перевод, `details`, примеры, cloze); транскрипцию приложение само дотягивает из Datamuse при импорте - и только для отдельных слов (для фраз и cloze словарный лукап пропускается). Аудио в файле не приходит: озвучку синтезирует облако по тексту заметки, сразу при импорте.

**Импорт выполняет бэкенд.** Фронт разбирает файл (`parseDeck`), показывает превью и шлёт разобранную колоду одной ручкой в Edge Function `import-deck`. Она делает словарные лукапы, ищет дубликаты, пишет `notes` + `cards` и прогревает озвучку. Раньше всё это делал фронт: колода из 50 слов означала 50 запросов в Datamuse с телефона, а озвучка синтезировалась лениво - по фразе на первом показе карточки. Превью при этом строится ЦЕЛИКОМ из файла, без единого запроса: слово, перевод, тип и дубликаты видны и без словаря, а транскрипция появляется после импорта.

```json
{
  "version": 1,
  "folder": "Animals",
  "notes": [
    {
      "type": "basic",
      "front": "otter",
      "back": "выдра",
      "reverse": true,
      "tags": ["animals", "water"],
      "examples": [
        { "text": "The otter cracked a shell on its belly.",
          "translation": "Выдра разбила раковину на животе." }
      ],
      "details": "**Часть речи:** существительное\n\n**Нюансы:** sea otter (калан) - другой вид..."
    },
    {
      "type": "cloze",
      "front": "The fox is a {{cunning::хитрый}} animal.",
      "back": "Лиса - хитрое животное.",
      "tags": ["animals"],
      "details": "..."
    }
  ]
}
```

- Cloze-синтаксис: `{{ответ}}` или `{{ответ::подсказка}}`. В MVP несколько пропусков прячутся разом (одна карточка).
- `transcription` и `audio_url` намеренно не присылаются - приложение заполнит.
- Импортер терпим: нет `back`/`details` - ок; слово не нашлось в словаре - карточка создаётся без аудио/транскрипции; дубликаты (то же `front` в той же папке) - предупреждение, не молчаливое задвоение.

---

## 5. Функционал

### MVP (волна 1)

- Папки (плоские) + изучение по выбранным папкам; cram-режим (тренировка папки вне расписания, без изменения FSRS).
- Типы карточек: basic (+ обратная) и cloze.
- Info-панель (Markdown) под иконкой на обороте.
- Картинки к карточкам - подтягиваются из image-API (конкретный сервис выбрать позже), не добавляются вручную; хранение/кэш через Supabase Storage.
- Примеры структурированным списком, с озвучкой по кнопке.
- TTS: выбор голоса US/UK, скорость, автопроигрывание (опция). Озвучивать не только отдельное слово, но и фразу/предложение целиком (по возможности).
- JSON-экспорт/импорт - loseless, со состоянием FSRS (полный бэкап и перенос).
- Импорт файла от нейросети + дотягивание транскрипции из Datamuse.
- Поиск и фильтры по заметкам.
- Статистика: стрик, график активности, зрелость колоды.
- Undo последнего ответа (`scheduler` поддерживает откат).
- Горячие клавиши (десктоп: Space - перевернуть, 1–4 - оценка) и свайпы (мобайл).
- Индикатор синка/офлайна + кнопка ручной синхронизации.

### Волна 2

- Режим печати ответа (проверка написания через расстояние Левенштейна - честное применение, для орфографии).
- CSV-импорт (только на вход, lossy).
- Массовое добавление с автозаполнением.
- Прогноз нагрузки на 7 дней (считается из FSRS).
- Детект дубликатов.
- Leeches (карточки с высоким `lapses`): подсветка, пауза, переформулировка.
- UI и фильтрация по тегам.
- Sibling burying (не показывать обе стороны слова в один день; флаг `bury_siblings` уже в схеме, по умолчанию выкл).

### Позже / возможно

- Anki-совместимость (`.apkg`).
- Web Share Target (на iOS-PWA поддержка слабая).
- Возврат распознавания речи через бэкенд + облачный STT/оценку произношения.

---

## 6. Экраны и навигация

Зоны: **Изучение** · **Библиотека** · **Добавление** · **Статистика** · **Настройки**.

- **Мобайл:** нижний таб-бар + крупная кнопка «+» (добавление). Свайпы для оценки, разворот карточки по тапу.
- **Десктоп:** левый сайдбар, шире контент, горячие клавиши. Одно дерево компонентов, навигационный хром меняется по брейкпоинту.

**Сессия изучения:** выбор scope (все/конкретные папки) → сборка очереди → показ лица → раскрытие (тап/Space) → оценка Again/Hard/Good/Easy с превью интервала (`scheduler.repeat`) → следующая → итог сессии (сколько повторено, точность). Доступен Undo.

**Отрисовка оборота зависит от направления:**
- `forward` (EN→RU): лицо - английское слово + кнопка озвучки; оборот - перевод + примеры + иконка info (details).
- `reverse` (RU→EN): лицо - русский; оборот - английское слово крупно + транскрипция + озвучка + примеры + info.
- `cloze`: лицо - предложение с пропуском; оборот - заполненное предложение + перевод + озвучка + info.

**Поток «добавить заметку»** (трение здесь - враг №1):
- Открытие в один тап (FAB / хоткей `n`).
- Ввод `front` → на debounce автозаполнение из Datamuse (транскрипция, определения → выбор значения у многозначного слова). Примеров словарь не даёт - они вводятся руками либо приходят из файла нейросети.
- `back` (перевод) - единственное обязательно-ручное поле (Datamuse перевода не даёт).
- Папка (выбор или создание инлайн), тип, `reverse`, теги (опц.), примеры (редактируемый список), details (сворачиваемый Markdown).
- Save → `buildCardsForNote` создаёт карточки.
- Импорт - первоклассный путь (основной способ наполнения), ручная форма - для разовых добавлений.

**Аудио:** единственный источник - облачный синтез Azure: слова, фразы, примеры и cloze-предложения. Локальный синтез устройства (Web Speech) остаётся фолбэком - офлайн, исчерпанная квота, качество «На устройстве» в настройках.

Живые записи OneLook убраны (были основным источником для отдельных слов). Причины: запись существовала далеко не у каждого слова, URL был недокументированным внутренним путём чужого сайта, а голоса Azure звучат так же хорошо на всём материале - и слово, и его пример теперь озвучены одним голосом.

**Озвучка греется заранее, на бэкенде.** После импорта (`import-deck`) и после сохранения заметки в форме (`warm-audio`) сервер синтезирует слова и примеры и складывает mp3 в бакет `tts`. К моменту показа карточки файл уже готов, и лоадера нет. Ключ файла - хэш от текста, голоса и скорости, поэтому повторный прогрев квоту не тратит.

**Произношение US/UK:** переключатель в настройках задаёт голос Azure (Ava US / Sonia UK) и акцент локального фолбэка.

**Скорость озвучки убрана из настроек** и зафиксирована на 1×: облако запекает её в mp3, и она входит в ключ кэша - каждая новая скорость означала бы повторный платный синтез всей колоды. Поле `tts_rate` в схеме осталось, регулятор в UI закомментирован.

---

## 7. Подводные камни (свод)

- **iPhone PWA:** распознавание речи не работает в установленном виде → вне MVP. Нет Background Sync → синк только при открытом приложении.
- **TTS Web Speech:** список голосов грузится асинхронно (`voiceschanged`); доступность US/UK голосов зависит от ОС; качество разнится. Обернуть в `useSpeech` с фолбэками.
- **Даты:** конвертировать на границе строка↔FSRS; передача строки туда, где ждут `Date`, молча ломает интервалы.
- **Enum'ы:** `state`/`rating` - числовые, импортировать из ts-fsrs, не хардкодить.
- **`updated_at`:** владеет триггер на сервере, иначе инкрементальный синк сбоит при расхождении часов.
- **Удаление:** только soft delete; все выборки фильтруют `deleted = false`.
- **Legend-State:** при долгом офлайне возможны пропуски синка - нужна кнопка ручной синхронизации.
- **`learning_steps`:** поле зависит от версии ts-fsrs - сверить, при отсутствии убрать колонку.
- **Datamuse:** перевода и примеров не даёт; лукап только для отдельных слов; обрабатывать офлайн и «слово не найдено»; запросы троттлить и кэшировать (особенно при импорте 50+ заметок). «Слова нет» - это `200` с пустым массивом, а не 404: по статусу промах не отличить, в том числе в рантайм-кэше. Транскрипция приходит только с `md=…r`; `ipa=1` лишь меняет её формат с ARPAbet на IPA. IPA даётся американский, даже когда играет британская запись.
- **Ключ кэша озвучки** живёт в ДВУХ местах: `src/speech/cloudTts.ts` (клиент) и `supabase/functions/_shared/tts.ts` (сервер). Клиентская копия обязана быть синхронной - любой `await` между кликом и `play()` тратит жест пользователя на iOS и глушит звук. Формулы разъедутся - клиент будет вечно мазать мимо кэша, а сервер синтезировать заново, и тесты при этом останутся зелёными.
- **Azure F0:** 500 тыс. символов в месяц и жёсткий лимит запросов в секунду. `429` означает и то, и другое - различить можно только по тому, отпустит ли через минуту; клиент выдерживает паузу в обоих случаях.
- **Markdown в details:** контент приходит извне (нейросеть) → санитизировать при рендере.

---

## 8. План реализации (порядок сборки)

Каждый этап оставляет что-то запускаемое.

> **Стратегия: сначала на моках.** Приложение собирается на локальных мок-данных (in-memory / IndexedDB), UI и логика (очередь, FSRS, формы, импорт, статистика) доводятся до рабочего состояния без бэкенда. Supabase (этап 2) и `syncedSupabase` (этап 3) подключаются позже - слой данных проектируется за интерфейсом, чтобы мок-хранилище заменялось на `syncedSupabase` без переписывания UI. Порядок сборки поэтому: каркас → мок-слой данных → изучение/библиотека/добавление/импорт/статистика на моках → затем Supabase-интеграция и синк → PWA-полировка.

1. **Каркас проекта.** Vite + React + TS, Tailwind + токены дизайна (из макетов «Тёплый»), vite-plugin-pwa (манифест, прекэш оболочки), структура папок, роутинг и навигационный хром (таб-бар/сайдбар по брейкпоинту).

> **Решение по UI (отклонение от §2, зафиксировано после дизайна):** от Mantine отказались. Дизайн полностью авторский (кастомный переворот карточки, тогглы, сегмент-контролы, таб-бар с FAB, самодельные бары/чарты) - UI-кит создавал бы больше трения при переопределении дефолтов, чем пользы. Вместо него Tailwind с токенами из макетов; доступные dropdown/dialog и хоткеи добавляем точечными headless-библиотеками.
2. **Supabase.** Проект, миграции (схема из §3), триггеры, RLS-политики, Auth через magic link, бакет Storage для картинок.
3. **Слой данных.** Legend-State + `syncedSupabase` для `folders/notes/cards/review_logs/settings` (IndexedDB-персистенция, `changesSince: 'last-sync'`, soft delete, `generateId`), хуки-обёртки над наблюдаемыми, индикатор/кнопка синка.
4. **`useSpeech`.** Web Speech синтез: загрузка голосов, выбор US/UK, скорость, фолбэк, автоплей.
5. **Режим изучения.** Сборка очереди по scope + лимит новых, отрисовка карточки по направлению, оценка через `scheduler.next`, запись в `review_logs`, превью интервалов, Undo, итог сессии, cram-режим.
6. **Библиотека и добавление.** CRUD папок и заметок, форма добавления с автозаполнением (Datamuse через React Query), порождение/удаление карточек при смене `reverse`, картинки, info-панель, поиск/фильтры.
7. **Импорт/экспорт.** JSON loseless в обе стороны; импорт файла нейросети с превью и обогащением из словаря; обработка дубликатов и ошибок.
8. **Статистика.** Стрик, график активности (Recharts по `review_logs`), зрелость колоды.
9. **PWA-полировка.** Рантайм-кэш словаря и аудио, офлайн-поведение, доступность (фокус, `prefers-reduced-motion`), стартовая колода-пример, проверка установки на iPhone и десктоп.

---

## 9. Открытые вопросы на будущее

- Несколько пропусков в одном cloze (нумерованные группы как в Anki).
- Sibling burying - включить, когда появится ощущение, что стороны подсказывают друг друга.
- Оптимизатор весов FSRS на собственных `review_logs` (`@open-spaced-repetition/binding`).
- Возврат произношения: выбор облачного сервиса (например, оценка по фонемам), бэкенд-эндпоинт, стоимость.
- Источник картинок: выбрать image-API (лицензия, лимиты, релевантность подбора по слову) для автоматического подбора изображений.
