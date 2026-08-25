import { createContext } from 'react'
import type { Repository } from '@/data/repo'

export const RepoContext = createContext<Repository | null>(null)
