import { describe, expect, it } from 'vitest'

import { generateTimetableOccurrences, validateAcademicConfig } from './academic'

const baseConfig = {
  semester: {
    code: 'test-semester',
    name: 'Test Semester',
    startDate: '2026-09-07',
    endDate: '2026-09-27',
    active: true,
    standardPeriods: [{ period: 1, startTime: '08:00', endTime: '08:45' }],
  },
  classes: [{ classCode: 'TEST-01', name: 'Test Class' }],
  courses: [{ courseCode: 'TEST-COURSE', name: 'Test Course', kind: 'REQUIRED', teacher: null }],
  timetable: [{ classCode: 'TEST-01', courseCode: 'TEST-COURSE', weekday: 1, startPeriod: 1, endPeriod: 1, classroom: null, teacher: null, startWeek: 1, endWeek: 3, weekPattern: 'ALL', specifiedWeeks: null }],
}

describe('academic config', () => {
  it('validates nested config and materializes specified week patterns', () => {
    const config = validateAcademicConfig({
      ...baseConfig,
      timetable: [{ ...baseConfig.timetable[0], weekPattern: 'ALL', specifiedWeeks: [1, 3] }],
    })
    const occurrences = generateTimetableOccurrences(config.semester, config.timetable[0]!, '08:00', '08:45')
    expect(occurrences.map((item) => item.week)).toEqual([1, 3])
  })

  it('rejects invalid references, periods, and duplicate course codes', () => {
    expect(() => validateAcademicConfig({
      ...baseConfig,
      courses: [...baseConfig.courses, { ...baseConfig.courses[0], name: 'Duplicate' }],
    })).toThrow('courseCode must be unique')
    expect(() => validateAcademicConfig({
      ...baseConfig,
      timetable: [{ ...baseConfig.timetable[0], weekday: 8 }],
    })).toThrow('weekday must be between 1 and 7')
  })
})
