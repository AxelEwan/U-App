import { TZDate } from '@date-fns/tz'

export interface WeeklyScheduleRule {
  readonly timezone: string
  readonly startDate: string
  readonly endDate: string
  readonly weekdays: readonly number[]
  readonly startTime: string
  readonly endTime: string
  readonly intervalWeeks: number
}

export interface GeneratedSessionTime {
  readonly localDate: string
  readonly scheduledStartAt: Date
  readonly scheduledEndAt: Date
}

interface DateParts {
  year: number
  month: number
  day: number
}

function parseDate(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new RangeError(`Invalid local date: ${value}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid local date: ${value}`)
  }
  return { year, month, day }
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new RangeError(`Invalid local time: ${value}`)
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) throw new RangeError(`Invalid local time: ${value}`)
  return { hour, minute }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function generateWeeklySessionTimes(rule: WeeklyScheduleRule): GeneratedSessionTime[] {
  if (!Number.isInteger(rule.intervalWeeks) || rule.intervalWeeks < 1) {
    throw new RangeError('intervalWeeks must be a positive integer')
  }
  if (rule.weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
    throw new RangeError('weekdays must use ISO values 1 through 7')
  }

  const startDate = parseDate(rule.startDate)
  const endDate = parseDate(rule.endDate)
  const startTime = parseTime(rule.startTime)
  const endTime = parseTime(rule.endTime)
  const cursor = new Date(Date.UTC(startDate.year, startDate.month - 1, startDate.day))
  const end = new Date(Date.UTC(endDate.year, endDate.month - 1, endDate.day))
  if (cursor > end) throw new RangeError('Schedule end date must not precede start date')

  const firstDay = cursor.getTime()
  const result: GeneratedSessionTime[] = []
  while (cursor <= end) {
    const elapsedDays = Math.floor((cursor.getTime() - firstDay) / 86_400_000)
    const intervalMatches = Math.floor(elapsedDays / 7) % rule.intervalWeeks === 0
    const isoWeekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay()
    if (intervalMatches && rule.weekdays.includes(isoWeekday)) {
      const year = cursor.getUTCFullYear()
      const month = cursor.getUTCMonth()
      const day = cursor.getUTCDate()
      const localStart = new TZDate(
        year,
        month,
        day,
        startTime.hour,
        startTime.minute,
        rule.timezone,
      )
      const localEnd = new TZDate(
        year,
        month,
        day,
        endTime.hour,
        endTime.minute,
        rule.timezone,
      )
      if (localEnd.getTime() <= localStart.getTime()) {
        throw new RangeError('Session end time must be after start time')
      }
      result.push({
        localDate: formatDate(cursor),
        scheduledStartAt: new Date(localStart.getTime()),
        scheduledEndAt: new Date(localEnd.getTime()),
      })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return result
}
