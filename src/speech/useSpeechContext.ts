import { useContext } from 'react'
import { SpeechContext } from '@/speech/SpeechContext'

/** Общий экземпляр озвучки. Бросает вне `SpeechProvider` - ловит забытую обёртку. */
export function useSpeechContext() {
  const ctx = useContext(SpeechContext)
  if (!ctx) throw new Error('useSpeechContext must be used within SpeechProvider')
  return ctx
}
