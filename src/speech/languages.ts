export type StudyLanguage = "en" | "de" | "it" | "fr" | "es";
export type VoiceByLanguage = Partial<Record<StudyLanguage, string | null>>;

export interface StudyLanguageOption {
  value: StudyLanguage;
  label: string;
  shortLabel: string;
  hint: string;
  locale: string;
  azureVoice: string;
  testPhrase: string;
}

export const STUDY_LANGUAGES: readonly StudyLanguageOption[] = [
  {
    value: "en",
    label: "English",
    shortLabel: "EN",
    hint: "US pronunciation",
    locale: "en-US",
    azureVoice: "en-US-AvaMultilingualNeural",
    testPhrase: "This is how it sounds.",
  },
  {
    value: "de",
    label: "Deutsch",
    shortLabel: "DE",
    hint: "German voice",
    locale: "de-DE",
    azureVoice: "de-DE-SeraphinaMultilingualNeural",
    testPhrase: "So klingt es.",
  },
  {
    value: "it",
    label: "Italiano",
    shortLabel: "IT",
    hint: "Italian voice",
    locale: "it-IT",
    azureVoice: "it-IT-IsabellaMultilingualNeural",
    testPhrase: "Ecco come suona.",
  },
  {
    value: "fr",
    label: "Français",
    shortLabel: "FR",
    hint: "French voice",
    locale: "fr-FR",
    azureVoice: "fr-FR-DeniseNeural",
    testPhrase: "Voici le son.",
  },
  {
    value: "es",
    label: "Español",
    shortLabel: "ES",
    hint: "Spanish voice",
    locale: "es-ES",
    azureVoice: "es-ES-ElviraNeural",
    testPhrase: "Así suena.",
  },
];

export const DEFAULT_STUDY_LANGUAGE: StudyLanguage = "en";

export function normalizeStudyLanguage(value: unknown): StudyLanguage {
  return STUDY_LANGUAGES.some((lang) => lang.value === value)
    ? (value as StudyLanguage)
    : DEFAULT_STUDY_LANGUAGE;
}

export function normalizeVoiceByLanguage(value: unknown): VoiceByLanguage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: VoiceByLanguage = {};
  for (const language of STUDY_LANGUAGES) {
    const voice = raw[language.value];
    if (typeof voice === "string" && voice.trim()) out[language.value] = voice;
  }
  return out;
}

export function languageOption(language: StudyLanguage): StudyLanguageOption {
  return (
    STUDY_LANGUAGES.find((item) => item.value === language) ??
    STUDY_LANGUAGES[0]!
  );
}

export function cloudVoice(language: StudyLanguage): string {
  return languageOption(language).azureVoice;
}

export function detectStudyLanguage(text: string): StudyLanguage {
  const clean = text.toLowerCase();
  if (/[ßäöü]/.test(clean)) return "de";
  if (/[àèéìòù]/.test(clean)) return "it";
  if (/[âêîôûëïüÿœç]/.test(clean)) return "fr";
  if (/[áéíóúñ¿¡]/.test(clean)) return "es";
  return DEFAULT_STUDY_LANGUAGE;
}
