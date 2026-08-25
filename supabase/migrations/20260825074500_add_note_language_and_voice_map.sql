alter table notes
  add column if not exists study_language text not null default 'en'
    check (study_language in ('en', 'de', 'it', 'fr', 'es'));

alter table settings
  add column if not exists tts_voices jsonb not null default '{}'::jsonb;
