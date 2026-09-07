import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react'

import { mockRepository } from './mockRepository'
import type { MockState } from './types'
import { apiRepository } from '../repositories/apiRepository'
import type { CurrentUser } from '../navigation/definitions'

interface MockContextValue {
  readonly state: MockState
  readonly repository: typeof mockRepository
  readonly apiRepository: typeof apiRepository
  readonly isDevelopment: boolean
}

const MockContext = createContext<MockContextValue | null>(null)

const anonymousState: MockState = {
  currentUser: { id: '', displayName: '未登录', roleLabel: '未认证', capabilities: { canManageProjects: false } },
  homeScenario: 'EMPTY',
  courses: [],
  publishTasks: [],
}

export function MockProvider({ children }: PropsWithChildren) {
  const isDevelopment = process.env.NODE_ENV !== 'production' && process.env.TARO_APP_ENABLE_DEV_AUTH === 'true'
  const [state, setState] = useState<MockState>(() => isDevelopment ? mockRepository.getState() : anonymousState)
  useEffect(() => isDevelopment ? mockRepository.subscribe(() => setState(mockRepository.getState())) : undefined, [isDevelopment])
  useEffect(() => {
    if (isDevelopment) {
      apiRepository.setDevRole(state.currentUser.capabilities.canManageProjects ? 'ADMIN' : 'STUDENT')
      return
    }
    let active = true
    void apiRepository.getMe().then((user) => {
      if (!active) return
      const currentUser: CurrentUser = { id: user.userId, displayName: user.displayName, roleLabel: user.capabilities.canManageProjects ? '管理员' : '普通成员', capabilities: user.capabilities }
      setState((current) => ({ ...current, currentUser }))
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
