import { generateWeeklySessionTimes, type GeneratedSessionTime } from './recurrence'

export type AcademicWeekPattern = 'ALL' | 'ODD' | 'EVEN'

export interface AcademicSemesterInput {
  readonly code: string
  readonly name: string
  readonly startDate: string
  readonly endDate: string
  readonly active: boolean
  readonly standardPeriods: readonly { period: number; startTime: string; endTime: string }[]
}

export interface AcademicClassInput {
  readonly classCode: string
  readonly name: string
}

export interface AcademicCourseInput {
  readonly courseCode: string
  readonly name: string
  readonly kind: 'REQUIRED' | 'ELECTIVE'
  readonly teacher: string | null
}

export interface AcademicTimetableInput {
  readonly classCode: string
  readonly courseCode: string
  readonly weekday: number
  readonly startPeriod: number
  readonly endPeriod: number
  readonly classroom: string | null
  readonly teacher: string | null
  readonly startWeek: number
  readonly endWeek: number
  readonly weekPattern: AcademicWeekPattern
  readonly specifiedWeeks: readonly number[] | null
}

export interface AcademicConfigInput {
  readonly semester: AcademicSemesterInput
  readonly classes: readonly AcademicClassInput[]
  readonly courses: readonly AcademicCourseInput[]
  readonly timetable: readonly AcademicTimetableInput[]
}

export interface AcademicOccurrence extends GeneratedSessionTime {
  readonly week: number
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^\d{2}:\d{2}$/

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RangeError(message)
}

function validDate(value: string): boolean {
  if (!datePattern.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

function minutes(value: string): number {
  assert(timePattern.test(value), `Invalid time: ${value}`)
  const hour = Number(value.slice(0, 2))
  const minute = Number(value.slice(3, 5))
  assert(hour <= 23 && minute <= 59, `Invalid time: ${value}`)
  return hour * 60 + minute
}

function nonEmpty(value: unknown, field: string, max: number): string {
  assert(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `Invalid ${field}`)
  return value.trim()
}

function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined || value === '') return null
  return nonEmpty(value, field, max)
}

function positiveInteger(value: unknown, field: string): number {
  assert(Number.isInteger(value) && (value as number) > 0, `Invalid ${field}`)
  return value as number
}

function unique(values: readonly string[], field: string): void {
  assert(new Set(values).size === values.length, `${field} must be unique`)
}

function rawSemester(raw: Record<string, unknown>): Record<string, unknown> {
  return raw.semester && typeof raw.semester === 'object' && !Array.isArray(raw.semester)
    ? raw.semester as Record<string, unknown>
    : raw
}

export function validateAcademicConfig(raw: unknown): AcademicConfigInput {
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'Academic config must be a JSON object')
  const value = raw as Record<string, unknown>
  const semesterValue = rawSemester(value)
  const code = nonEmpty(semesterValue.code, 'semester.code', 32)
  const name = nonEmpty(semesterValue.name, 'semester.name', 120)
  const startDate = nonEmpty(semesterValue.startDate, 'semester.startDate', 10)
  const endDate = nonEmpty(semesterValue.endDate, 'semester.endDate', 10)
  assert(validDate(startDate) && validDate(endDate) && startDate <= endDate, 'Semester dates are invalid')
  const active = semesterValue.active === undefined ? true : semesterValue.active
  assert(typeof active === 'boolean', 'semester.active must be boolean')

  const rawPeriods = semesterValue.standardPeriods
  assert(Array.isArray(rawPeriods) && rawPeriods.length > 0, 'standardPeriods must not be empty')
  const standardPeriods = rawPeriods.map((item) => {
    assert(item && typeof item === 'object', 'Invalid standard period')
    const period = positiveInteger((item as Record<string, unknown>).period, 'period')
    const startTime = nonEmpty((item as Record<string, unknown>).startTime, 'startTime', 5)
    const endTime = nonEmpty((item as Record<string, unknown>).endTime, 'endTime', 5)
    assert(minutes(endTime) > minutes(startTime), `Period ${period} must end after it starts`)
    return { period, startTime, endTime }
  })
  assert(new Set(standardPeriods.map((item) => item.period)).size === standardPeriods.length, 'standardPeriods must not repeat period')

  const rawClasses = value.classes
  assert(Array.isArray(rawClasses) && rawClasses.length > 0, 'classes must not be empty')
  const classes = rawClasses.map((item) => {
    assert(item && typeof item === 'object', 'Invalid class')
    const object = item as Record<string, unknown>
    return { classCode: nonEmpty(object.classCode, 'classCode', 64), name: nonEmpty(object.name, 'class name', 120) }
  })
  unique(classes.map((item) => item.classCode), 'classCode')

  const rawCourses = value.courses
  assert(Array.isArray(rawCourses) && rawCourses.length > 0, 'courses must not be empty')
  const courses = rawCourses.map((item): AcademicCourseInput => {
    assert(item && typeof item === 'object', 'Invalid course')
    const object = item as Record<string, unknown>
    const kind = object.kind
    assert(kind === 'REQUIRED' || kind === 'ELECTIVE', 'Course kind must be REQUIRED or ELECTIVE')
    return { courseCode: nonEmpty(object.courseCode, 'courseCode', 64), name: nonEmpty(object.name, 'course name', 160), kind, teacher: nullableText(object.teacher, 'teacher', 120) }
  })
  unique(courses.map((item) => item.courseCode), 'courseCode')

  const classCodes = new Set(classes.map((item) => item.classCode))
  const courseCodes = new Set(courses.map((item) => item.courseCode))
  const periods = new Set(standardPeriods.map((item) => item.period))
  const rawTimetable = value.timetable
  assert(Array.isArray(rawTimetable) && rawTimetable.length > 0, 'timetable must not be empty')
  const timetable = rawTimetable.map((item): AcademicTimetableInput => {
    assert(item && typeof item === 'object', 'Invalid timetable row')
    const object = item as Record<string, unknown>
    const classCode = nonEmpty(object.classCode, 'timetable.classCode', 64)
    const courseCode = nonEmpty(object.courseCode, 'timetable.courseCode', 64)
    const weekday = positiveInteger(object.weekday, 'weekday')
    const startPeriod = positiveInteger(object.startPeriod, 'startPeriod')
    const endPeriod = positiveInteger(object.endPeriod, 'endPeriod')
    const startWeek = positiveInteger(object.startWeek, 'startWeek')
    const endWeek = positiveInteger(object.endWeek, 'endWeek')
    const weekPattern = (object.weekPattern === undefined ? 'ALL' : object.weekPattern) as AcademicWeekPattern
    const specifiedWeeks = object.specifiedWeeks === undefined || object.specifiedWeeks === null ? null : object.specifiedWeeks
    assert(classCodes.has(classCode), `Unknown classCode in timetable: ${classCode}`)
    assert(courseCodes.has(courseCode), `Unknown courseCode in timetable: ${courseCode}`)
    assert(weekday <= 7, 'weekday must be between 1 and 7')
    assert(startPeriod <= endPeriod && periods.has(startPeriod) && periods.has(endPeriod), 'Timetable periods are invalid')
    assert(startWeek <= endWeek, 'startWeek must not exceed endWeek')
    assert(weekPattern === 'ALL' || weekPattern === 'ODD' || weekPattern === 'EVEN', 'weekPattern must be ALL, ODD or EVEN')
    assert(specifiedWeeks === null || Array.isArray(specifiedWeeks), 'specifiedWeeks must be an array or null')
    const normalizedWeeks = specifiedWeeks === null ? null : specifiedWeeks.map((week) => positiveInteger(week, 'specifiedWeek'))
    if (normalizedWeeks) {
      assert(new Set(normalizedWeeks).size === normalizedWeeks.length, 'specifiedWeeks must not repeat')
      assert(normalizedWeeks.every((week) => week >= startWeek && week <= endWeek), 'specifiedWeeks must be within the row week range')
      assert(weekPattern === 'ALL', 'specifiedWeeks cannot be combined with ODD or EVEN')
    }
    return { classCode, courseCode, weekday, startPeriod, endPeriod, classroom: nullableText(object.classroom, 'classroom', 160), teacher: nullableText(object.teacher, 'teacher', 120), startWeek, endWeek, weekPattern, specifiedWeeks: normalizedWeeks }
  })
  const keys = new Set<string>()
  for (const row of timetable) {
    const key = timetableNaturalKey(row)
    assert(!keys.has(key), `Conflicting duplicate timetable row: ${key}`)
    keys.add(key)
  }
  return { semester: { code, name, startDate, endDate, active, standardPeriods }, classes, courses, timetable }
}

export function timetableNaturalKey(row: Pick<AcademicTimetableInput, 'classCode' | 'courseCode' | 'weekday' | 'startPeriod' | 'endPeriod' | 'startWeek' | 'endWeek' | 'weekPattern'>): string {
  return [row.classCode, row.courseCode, row.weekday, row.startPeriod, row.endPeriod, row.startWeek, row.endWeek, row.weekPattern].join('|')
}

function addWeeks(value: string, weeks: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + weeks * 7)
  return date.toISOString().slice(0, 10)
}

function weekNumber(semesterStart: string, localDate: string): number {
  return Math.floor((Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${semesterStart}T00:00:00Z`)) / 604_800_000) + 1
}

export function generateTimetableOccurrences(semester: AcademicSemesterInput, row: AcademicTimetableInput, startTime: string, endTime: string): AcademicOccurrence[] {
  const generated = generateWeeklySessionTimes({ timezone: 'Asia/Shanghai', startDate: semester.startDate, endDate: semester.endDate, weekdays: [row.weekday], intervalWeeks: 1, startTime, endTime })
  return generated
    .map((item) => ({ ...item, week: weekNumber(semester.startDate, item.localDate) }))
    .filter((item) => item.week >= row.startWeek && item.week <= row.endWeek)
    .filter((item) => row.specifiedWeeks ? row.specifiedWeeks.includes(item.week) : row.weekPattern === 'ALL' || (row.weekPattern === 'ODD' ? item.week % 2 === 1 : item.week % 2 === 0))
}

export function scheduleRuleDateRange(semester: AcademicSemesterInput, row: AcademicTimetableInput): { startDate: string; endDate: string } {
  return { startDate: addWeeks(semester.startDate, row.startWeek - 1), endDate: addWeeks(semester.startDate, row.endWeek - 1) }
}
