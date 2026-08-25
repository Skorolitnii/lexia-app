import type { NoteRow } from '@/types'
import type { IdbRepository } from '@/data/idb'

type SeedNote = Omit<
  NoteRow,
  'id' | 'user_id' | 'folder_id' | 'created_at' | 'updated_at' | 'deleted'
>

const SEED_FOLDER = { name: 'Animals', color: null }

const SEED_NOTES: SeedNote[] = [
  {
    type: 'basic',
    front: 'otter',
    back: 'выдра',
    transcription: null,
    audio_url: null,
    image_url: null,
    details: '**Часть речи:** существительное\n\n**Нюансы:** *sea otter* (калан) - другой вид.',
    examples: [
      {
        text: 'The otter cracked a shell on its belly.',
        translation: 'Выдра разбила раковину на животе.',
      },
    ],
    reverse: true,
    tags: [],
  },
  {
    type: 'basic',
    front: 'hedgehog',
    back: 'ёж',
    transcription: null,
    audio_url: null,
    image_url: null,
    details: null,
    examples: [],
    reverse: false,
    tags: [],
  },
  {
    type: 'cloze',
    front: 'The fox is a {{cunning::хитрый}} animal.',
    back: 'Лиса - хитрое животное.',
    transcription: null,
    audio_url: null,
    image_url: null,
    details: null,
    examples: [],
    reverse: false,
    tags: [],
  },
]

/** Засеять стартовую колоду один раз, если БД пуста. */
export async function seedIfEmpty(repo: IdbRepository): Promise<void> {
  if (!(await repo.isEmpty())) return
  const folder = await repo.createFolder({
    ...SEED_FOLDER,
    id: crypto.randomUUID(),
    position: 0,
  })
  for (const note of SEED_NOTES) {
    await repo.createNote({
      ...note,
      id: crypto.randomUUID(),
      folder_id: folder.id,
    })
  }
}
