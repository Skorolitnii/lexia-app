import { use } from 'react'
import { RepoContext } from '@/data/RepoContext'
import type { Repository } from '@/data/repo'

/** Доступ к слою данных. Требует обёртки в `RepoProvider`. */
export function useRepo(): Repository {
  const repo = use(RepoContext)
  if (!repo) throw new Error('useRepo must be used within RepoProvider')
  return repo
}
