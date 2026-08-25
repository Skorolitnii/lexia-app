-- Lexia - схема целиком (спека §3).
--
-- Собрана из прежних 0001–0003 в один файл на этапе тестирования: история
-- «поправка к поправке» пользы не несла, а данных на тот момент не было.
-- Дальше правки схемы добавляются НОВЫМИ файлами (`supabase migration new`),
-- этот больше не редактируется - он уже применён к базе.
--
-- Скрипт идемпотентный: повторный запуск не падает и ничего не затирает.

-- ПАПКИ (плоские, одна на заметку)
create table if not exists folders (
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
create table if not exists notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  type text not null default 'basic' check (type in ('basic','cloze')),
  front text not null,                  -- EN-слово/фраза либо предложение с {{cloze}}
  back text,                            -- перевод (RU)
  transcription text,                   -- IPA, дотягивается из Free Dictionary
  audio_url text,                       -- из Free Dictionary; null -> UI делает TTS
  image_url text,
  details text,                         -- Markdown: грамматика, нюансы, синонимы
  examples jsonb not null default '[]', -- [{text, translation}]
  reverse boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists notes_folder_idx on notes (user_id, folder_id) where deleted = false;

-- КАРТОЧКИ (направление + состояние FSRS)
create table if not exists cards (
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
  state smallint not null default 0,          -- 0 New /1 Learning /2 Review /3 Relearning
  last_review timestamptz,
  learning_steps integer not null default 0,  -- сверено с ts-fsrs 5.4.1: поле есть
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  -- Одна карточка на направление. На этот индекс опирается `syncCards`:
  -- повторное включение reverse оживляет ту же строку, а не заводит вторую.
  unique (note_id, direction)
);
create index if not exists cards_due_idx on cards (user_id, due)
  where deleted = false and suspended = false;

-- ЖУРНАЛ ПОВТОРЕНИЙ (append-only)
create table if not exists review_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  rating smallint not null,
  state smallint not null,        -- состояние ДО оценки (инвариант ts-fsrs)
  due timestamptz,
  stability double precision,
  difficulty double precision,
  elapsed_days integer,
  last_elapsed_days integer,
  scheduled_days integer,
  review timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists review_logs_activity_idx on review_logs (user_id, review);

-- НАСТРОЙКИ (одна строка на пользователя)
create table if not exists settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  new_cards_per_day integer not null default 20,
  bury_siblings boolean not null default false,
  tts_voice text,
  tts_rate double precision not null default 1.0,
  updated_at timestamptz not null default now()
);

-- ТРИГГЕР updated_at
-- Временем владеет сервер: иначе расхождение часов между устройствами
-- ломает инкрементальный синк (§3).
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists folders_updated_at on folders;
create trigger folders_updated_at  before update on folders  for each row execute function set_updated_at();
drop trigger if exists notes_updated_at on notes;
create trigger notes_updated_at    before update on notes    for each row execute function set_updated_at();
drop trigger if exists cards_updated_at on cards;
create trigger cards_updated_at    before update on cards    for each row execute function set_updated_at();
drop trigger if exists settings_updated_at on settings;
create trigger settings_updated_at before update on settings for each row execute function set_updated_at();

-- СТРОКА НАСТРОЕК ДЛЯ НОВОГО ПОЛЬЗОВАТЕЛЯ (бывш. 0002)
--
-- Триггер, а не upsert в клиенте: строка создаётся ровно один раз и не зависит
-- от того, с какого устройства вошли первым. `security definer` обязателен -
-- вставка идёт до того, как у сессии появится `auth.uid()`, и RLS-политика
-- `auth.uid() = user_id` иначе отбила бы собственный триггер.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Уже существующим пользователям строку заводим разово: триггер сработает
-- только для будущих регистраций.
insert into settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- RLS
-- Без неё publishable-ключ (он же бывший anon) читал бы чужие строки:
-- ключ лежит во фронтенде, поэтому политики - единственная реальная защита.
alter table folders     enable row level security;
alter table notes       enable row level security;
alter table cards       enable row level security;
alter table review_logs enable row level security;
alter table settings    enable row level security;

-- folders / notes / cards / settings: select + insert + update
do $$
declare t text;
begin
  foreach t in array array['folders','notes','cards','settings'] loop
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select using (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format('create policy %I_insert on %I for insert with check (auth.uid() = user_id)', t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format('create policy %I_update on %I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- review_logs: select + insert. Журнал неизменяем (§3) - update-политики нет,
-- поэтому Undo на сервере строку не удаляет, в отличие от локальной версии.
drop policy if exists logs_select on review_logs;
create policy logs_select on review_logs for select using (auth.uid() = user_id);
drop policy if exists logs_insert on review_logs;
create policy logs_insert on review_logs for insert with check (auth.uid() = user_id);

-- DELETE-ПОЛИТИКИ (бывш. 0003)
--
-- Нужны ровно для восстановления из бэкапа. В остальном приложении удаление
-- только мягкое (§7), и это не меняется. Но `replaceAll` обязан вернуть базу в
-- вид файла, а не наложить его поверх - иначе строки, удалённые уже ПОСЛЕ
-- снятия бэкапа, останутся, и восстановление перестанет быть восстановлением.
--
-- Политики узкие: стереть можно только свои строки, чужие не видны.
do $$
declare t text;
begin
  foreach t in array array['folders','notes','cards'] loop
    execute format('drop policy if exists %I_delete on %I', t, t);
    execute format('create policy %I_delete on %I for delete using (auth.uid() = user_id)', t, t);
  end loop;
end $$;

-- Журнал в обычной работе append-only и здесь, но полное восстановление обязано
-- заменить и его - иначе статистика после отката покажет чужую историю.
drop policy if exists logs_delete on review_logs;
create policy logs_delete on review_logs for delete using (auth.uid() = user_id);

-- settings НЕ получает delete: строка одна на пользователя, её создаёт триггер
-- выше, и восстановление обновляет её на месте.
