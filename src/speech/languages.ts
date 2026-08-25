export type StudyLanguage = "en" | "de" | "it" | "fr" | "es";

export interface StudyLanguageOption {
  value: StudyLanguage;
  label: string;
  hint: string;
  locale: string;
  azureVoice: string;
  testPhrase: string;
}

export const STUDY_LANGUAGES: readonly StudyLanguageOption[] = [
  {
    value: "en",
    label: "English",
    hint: "US pronunciation",
    locale: "en-US",
    azureVoice: "en-US-AvaMultilingualNeural",
    testPhrase: "This is how it sounds.",
  },
  {
    value: "de",
    label: "Deutsch",
    hint: "German voice",
    locale: "de-DE",
    azureVoice: "de-DE-SeraphinaMultilingualNeural",
    testPhrase: "So klingt es.",
  },
  {
    value: "it",
    label: "Italiano",
    hint: "Italian voice",
    locale: "it-IT",
    azureVoice: "it-IT-IsabellaMultilingualNeural",
    testPhrase: "Ecco come suona.",
  },
  {
    value: "fr",
    label: "Français",
    hint: "French voice",
    locale: "fr-FR",
    azureVoice: "fr-FR-DeniseNeural",
    testPhrase: "Voici le son.",
  },
  {
    value: "es",
    label: "Español",
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

export function languageOption(language: StudyLanguage): StudyLanguageOption {
  return (
    STUDY_LANGUAGES.find((item) => item.value === language) ??
    STUDY_LANGUAGES[0]!
  );
}

export function cloudVoice(language: StudyLanguage): string {
  return languageOption(language).azureVoice;
}
