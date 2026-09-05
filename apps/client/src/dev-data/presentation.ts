import type { MockCourse } from './types'

export function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatRange(start: Date, end: Date): string {
  return `${formatTime(start)}–${formatTime(end)}`
}

export function atMinutes(base: Date, minutesFromNow: number): Date {
  return new Date(base.getTime() + minutesFromNow * 60_000)
}

export function courseEnd(course: MockCourse): number {
  return course.startMinutes + course.durationMinutes
}

export function isCourseCurrent(course: MockCourse, now: Date): boolean {
  const day = now.getDay() === 0 ? 7 : now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()
  return day === course.weekday && minutes >= course.startMinutes && minutes < courseEnd(course)
}
