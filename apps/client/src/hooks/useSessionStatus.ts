import { useEffect, useState } from 'react'
import type { SessionSummary } from '@qzu/contracts'
import { getSessionStatus, type SessionLifecycleStatus } from '../domain/sessionStatus'

export function useSessionStatus(session: Pick<SessionSummary, 'scheduledStartAt' | 'scheduledEndAt' | 'checkInOpenAt' | 'checkInCloseAt'>, clockOffset = 0): SessionLifecycleStatus {
  const [now, setNow] = useState(() => new Date(Date.now() + clockOffset))
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date(Date.now() + clockOffset)), 1000)
    return () => clearInterval(timer)
  }, [clockOffset])
  return getSessionStatus(session, now)
}
