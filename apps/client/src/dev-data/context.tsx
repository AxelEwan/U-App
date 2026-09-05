import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'

import { mockRepository } from './mockRepository'
import type { MockState } from './types'
import { apiRepository } from '../repositories/apiRepository'

interface MockContextValue {
  readonly state: MockState
  readonly repository: typeof mockRepository
  readonly apiRepository: typeof apiRepository
}

const MockContext = createContext<MockContextValue | null>(null)

export function MockProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(mockRepository.getState())
  useEffect(() => mockRepository.subscribe(() => setState(mockRepository.getState())), [])
  useEffect(() => { apiRepository.setDevRole(state.currentUser.capabilities.canManageProjects ? 'ADMIN' : 'STUDENT') }, [state.currentUser.capabilities.canManageProjects])
  return <MockContext.Provider value={{ state, repository: mockRepository, apiRepository }}>{children}</MockContext.Provider>
}

export function useMock(): MockContextValue {
  const value = useContext(MockContext)
  if (!value) throw new Error('MockProvider is missing')
  return value
}
