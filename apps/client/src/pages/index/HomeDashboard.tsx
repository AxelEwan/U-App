import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { SessionSummary, TodayResponse } from '@qzu/contracts'

import { useCountdown } from '../../hooks/useCountdown'
import { useSessionStatus } from '../../hooks/useSessionStatus'
import { useMock } from '../../dev-data/context'

function timeRange(session: SessionSummary): string {
  const format = (value: string) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
  return `${format(session.scheduledStartAt)}–${format(session.scheduledEndAt)}`
}

function statusLabel(status: ReturnType<typeof useSessionStatus>): string {
  const labels: Record<ReturnType<typeof useSessionStatus>, string> = { UPCOMING: '未开始', CHECKIN_OPEN: '签到开放', IN_PROGRESS: '进行中', CHECKIN_CLOSED: '签到已截止', ENDED: '已结束' }
  return labels[status]
}

export function HomeActiveCheckin({ session, clockOffset }: { readonly session: SessionSummary; readonly clockOffset: number }) {
  const status = useSessionStatus(session, clockOffset)
  const countdown = useCountdown(session.checkInCloseAt, clockOffset)
  return <View className="hero-card">
    <Text className="hero-kicker">正在进行的签到</Text>
    <Text className="card-title">{session.projectName}</Text>
    <Text className="card-meta">{timeRange(session)} · {session.locationName ?? '地点待定'}</Text>
    <Text className="card-meta">签到截止倒计时：{countdown.display} · {statusLabel(status)}</Text>
    <View className="primary-button hero-action" onClick={() => void Taro.showToast({ title: '签到接口将在后续接入', icon: 'none' })}>立即签到</View>
  </View>
}

export function HomeNextSession({ session, clockOffset }: { readonly session: SessionSummary; readonly clockOffset: number }) {
  const status = useSessionStatus(session, clockOffset)
  const countdown = useCountdown(session.scheduledStartAt, clockOffset)
  return <View className="card">
    <Text className="tag tag-primary">下一节课程</Text>
    <Text className="card-title" style={{ marginTop: 10 }}>{session.projectName}</Text>
    <Text className="card-meta">{countdown.display} · {timeRange(session)}</Text>
    <Text className="card-meta">{session.locationName ?? '地点待定'} · {statusLabel(status)}</Text>
  </View>
}

export function HomeTodaySchedule({ sessions }: { readonly sessions: readonly SessionSummary[] }) {
  return <View className="card">
    <Text className="card-title">今日课程</Text>
    {sessions.map((session) => <View className="timeline-item" key={session.id}>
      <Text className="timeline-time">{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(session.scheduledStartAt))}</Text>
      <View className="timeline-dot" />
      <View className="timeline-body"><Text className="timeline-name">{session.projectName}</Text><Text className="timeline-location">{timeRange(session)} · {session.locationName ?? '地点待定'}</Text></View>
    </View>)}
  </View>
}

export function HomeEmpty() {
  return <View className="empty-state"><Text className="empty-title">今天没有课程</Text><Text className="empty-copy">新的课程安排会在这里出现，今天先好好休息。</Text></View>
}

export default function HomeDashboard() {
  const { apiRepository } = useMock()
  const [today, setToday] = useState<TodayResponse | null>(null)
  const [clockOffset, setClockOffset] = useState(0)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    void apiRepository.getToday().then((value) => { if (active) { setClockOffset(new Date(value.serverTime).getTime() - Date.now()); setToday(value) } }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [apiRepository])
  if (error) return <View className="empty-state"><Text className="empty-title">暂时无法读取今日安排</Text><Text className="empty-copy">请确认本地 API 已启动。</Text></View>
  if (!today) return <View className="card"><Text className="card-meta">正在读取今日安排…</Text></View>
  const list = today.todaySessions
  return <>
    {today.activeCheckin ? <HomeActiveCheckin session={today.activeCheckin} clockOffset={clockOffset} /> : null}
    {!today.activeCheckin && today.nextSession ? <HomeNextSession session={today.nextSession} clockOffset={clockOffset} /> : null}
    {list.length ? <><View className="section-heading"><Text className="section-title">今日安排</Text><Text className="section-caption">实时数据</Text></View><HomeTodaySchedule sessions={list} /></> : <HomeEmpty />}
  </>
}
