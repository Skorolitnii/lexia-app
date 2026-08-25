import type { State } from "ts-fsrs";
import type { StudyLanguage, VoiceByLanguage } from "@/speech/languages";

/** Пример употребления в заметке. */
export interface Example {
  text: string;
  translation?: string;
}

/** Направление карточки - отдельный навык со своим расписанием FSRS. */
export type Direction = "forward" | "reverse" | "cloze";

/** Legacy: прежний выбор English accent, оставлен для старых бэкапов/строк. */
export type AudioRegion = "us" | "uk";

/** Папка (плоская, одна на заметку). */
export interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

/** Заметка - общий контент (её редактируешь). */
export interface NoteRow {
  id: string;
  user_id: string;
  folder_id: string | null;
  type: "basic" | "cloze";
  front: string;
  back: string | null;
  transcription: string | null;
  audio_url: string | null;
  image_url: string | null;
  details: string | null;
  examples: Example[];
  /** Язык изучаемого текста на лицевой стороне. Старые строки без поля = English. */
  study_language?: StudyLanguage;
  reverse: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

/** Карточка - конкретное направление + состояние FSRS (её учишь). */
export interface CardRow {
  id: string;
  user_id: string;
  note_id: string;
  direction: Direction;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: State;
  last_review: string | null;
  learning_steps: number;
  suspended: boolean;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

/** Журнал повторений (append-only). */
export interface ReviewLogRow {
  id: string;
  user_id: string;
  card_id: string;
  rating: number;
  state: number;
  due: string | null;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  last_elapsed_days: number | null;
  scheduled_days: number | null;
  review: string;
  created_at: string;
}

/** Настройки - одна строка на пользователя. */
export interface SettingsRow {
  user_id: string;
  /** Не редактируется и не показывается в UI (имя убрано со входа/настроек);
      колонка и поле оставлены как молчаливый passthrough - как `tags`. */
  display_name: string | null;
  new_cards_per_day: number;
  bury_siblings: boolean;
  tts_voice: string | null;
  /** Закреплённые голоса устройства по языкам. */
  tts_voices?: VoiceByLanguage;
  tts_rate: number;
  tts_autoplay: boolean;
  /** Legacy: старый US/UK accent. Новый выбор языка живёт в `study_language`. */
  audio_region: AudioRegion;
  /** Язык изучаемого материала. English всегда озвучивается en-US. */
  study_language: StudyLanguage;
  /** Облачный синтез фраз; выключен - озвучивает локальный Web Speech. */
  tts_cloud: boolean;
  updated_at: string;
}
