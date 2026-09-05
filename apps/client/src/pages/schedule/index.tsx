import { ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import type { SessionSummary } from '@qzu/contracts'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'
import { getSessionStatus } from '../../domain/sessionStatus'

const dayLabels = ['一', '二', '三', '四', '五', '六', '日']
const startHour = 8
const endHour = 20
const timeLabel = (date: Date) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
function weekday(date: Date): number { return date.getDay() === 0 ? 7 : date.getDay() }

export default function SchedulePage() {
  const { apiRepository } = useMock()
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([])
  const [error, setError] = useState(false)
  const today = weekday(new Date())
  useEffect(() => { void apiRepository.listSchedule().then(setSessions).catch(() => setError(true)) }, [apiRepository])
  const visibleDays = useMemo(() => dayLabels.map((label, index) => ({ label, weekday: index + 1 })), [])
  const slots = Array.from({ length: endHour - startHour }, (_, index) => startHour + index)
  return <PageShell eyebrow="WEEKLY PLAN" title="课程表" subtitle="按周查看课程安排，点击课程查看详情。">
    <View className="section-heading"><Text className="section-title">本周课程</Text><Text className="section-caption">工作日重点显示</Text></View>
    {error ? <View className="empty-state"><Text className="empty-title">课程表暂时不可用</Text><Text className="empty-copy">请确认本地 API 已启动。</Text></View> : <ScrollView className="schedule-scroll" scrollX enhanced showScrollbar={false}>
      <View className="schedule-grid"><View className="schedule-head">时间</View>
        {visibleDays.map((day) => <View className={`schedule-head ${day.weekday === today ? 'today' : ''}`} key={day.weekday}>周{day.label}</View>)}
        {slots.flatMap((hour) => [<View className="schedule-time" key={`time-${hour}`}>{String(hour).padStart(2, '0')}:00</View>, ...visibleDays.map((day) => {
          const course = sessions.find((item) => { const date = new Date(item.scheduledStartAt); return weekday(date) === day.weekday && date.getHours() === hour })
          const current = course ? ['CHECKIN_OPEN', 'IN_PROGRESS'].includes(getSessionStatus(course)) : false
          return <View className={`schedule-cell ${day.weekday === today ? 'today' : ''}`} key={`${hour}-${day.weekday}`}>
            {course ? <View className={`course-block ${current ? 'current' : ''}`} onClick={() => void Taro.navigateTo({ url: `/pages/course-detail/index?id=${course.id}` })}><Text className="course-block-name">{course.projectName}</Text><Text className="course-block-location">{timeLabel(new Date(course.scheduledStartAt))} · {course.locationName ?? '地点待定'}</Text></View> : null}
          </View>
        })])}
      </View>
    </ScrollView>}
    <View className="card card-muted"><Text className="card-meta">课程块支持跨多个时间段展示；当前课程会以绿色标识。</Text></View>
  </PageShell>
}
