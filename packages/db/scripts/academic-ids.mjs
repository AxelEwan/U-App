import { createHash } from 'node:crypto'

export function stableUuid(value) {
  const hex = createHash('sha1').update(value).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`
}

export function timetableKey(row) {
  return [row.classCode, row.courseCode, row.weekday, row.startPeriod, row.endPeriod, row.startWeek, row.endWeek, row.weekPattern].join('|')
}
