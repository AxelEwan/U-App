import { useEffect, useState } from 'react'

import { formatCountdown, formatRelativeTime, remainingMilliseconds } from '../domain/countdown'

export function useCountdown(targetAt: string | Date | null, clockOffset = 0) {
  const [now, setNow] = useState(() => Date.now() + clockOffset)
  useEffect(() => {
    setNow(Date.now() + clockOffset)
    const timer = setInterval(() => setNow(Date.now() + clockOffset), 1000)
    return () => clearInterval(timer)
  }, [targetAt, clockOffset])
  const remainingMs = remainingMilliseconds(targetAt, now)
  return { remainingMs, display: formatRelativeTime(remainingMs), clockDisplay: formatCountdown(remainingMs) }
}
