export function remainingMilliseconds(targetAt: string | Date | null, now = Date.now()): number {
  if (!targetAt) return 0
  const target = targetAt instanceof Date ? targetAt.getTime() : new Date(targetAt).getTime()
  return Math.max(0, target - now)
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000)
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function formatRelativeTime(milliseconds: number): string {
  const remaining = Math.max(0, milliseconds)
  return remaining > 10 * 60_000 ? `还有 ${Math.floor(remaining / 60_000)} 分钟` : formatCountdown(remaining)
}
