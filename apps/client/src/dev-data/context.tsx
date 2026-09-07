import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'

import { mockRepository } from './mockRepository'
import type { MockState } from './types'
import { apiRepository } from '../repositories/apiRepository'

interface MockContextValue {
  readonly state: MockState
  readonly repository: typeof mockRepository
  readonly apiRepository: typeof apiRepository
  readonly isDevelopment: boolean
}

const MockContext = createContext<MockContextValue | null>(null)

export function MockProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(mockRepository.getState())
  const isDevelopment = process.env.NODE_ENV !== 'production' && process.env.TARO_APP_ENABLE_DEV_AUTH === 'true'
  useEffect(() => isDevelopment ? mockRepository.subscribe(() => setState(mockRepository.getState())) : undefined, [isDevelopment])
  useEffect(() => {
    if (isDevelopment) {
      apiRepository.setDevRole(state.currentUser.capabilities.canManageProjects ? 'ADMIN' : 'STUDENT')
      return
    }
    let active = true
    void apiRepository.getMe().then((user) => {
      if (!active) return
      setState((current) => ({ ...current, currentUser: { id: user.userId, displayName: user.displayName, roleLabel: user.capabilities.canManageProjects ? '管理员' : '普通成员', capabilities: user.capabilities } }))
    }).catch(() => undefined)
    return () => { active = false }
  }, [isDevelopment, state.currentUser.capabilities.canManageProjects])
  return <MockContext.Provider value={{ state, repository: mockRepository, apiRepository, isDevelopment }}>{children}</MockContext.Provider>
}

export function useMock(): MockContextValue {
  const value = useContext(MockContext)
  if (!value) throw new Error('MockProvider is missing')
  return value
}
