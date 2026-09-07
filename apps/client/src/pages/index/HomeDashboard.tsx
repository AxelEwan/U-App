import { Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { OnboardingResponse, SessionSummary, TodayResponse } from '@qzu/contracts'

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

export function HomeActiveCheckin({ session, clockOffset, onCheckIn }: { readonly session: SessionSummary; readonly clockOffset: number; readonly onCheckIn: () => Promise<void> }) {
  const status = useSessionStatus(session, clockOffset)
  const countdown = useCountdown(session.checkInCloseAt, clockOffset)
  const [checking, setChecking] = useState(false)
  const handleCheckIn = async () => { setChecking(true); try { await onCheckIn(); await Taro.showToast({ title: '签到成功', icon: 'success' }) } catch { await Taro.showToast({ title: '签到失败，请稍后重试', icon: 'none' }) } finally { setChecking(false) } }
  return <View className="hero-card">
    <Text className="hero-kicker">正在进行的签到</Text>
    <Text className="card-title">{session.projectName}</Text>
    <Text className="card-meta">{timeRange(session)} · {session.locationName ?? '地点待定'}</Text>
    <Text className="card-meta">签到截止倒计时：{countdown.display} · {statusLabel(status)}</Text>
    <View className={`primary-button hero-action ${checking ? 'disabled' : ''}`} onClick={() => { if (!checking) void handleCheckIn() }}>{checking ? '签到中…' : '立即签到'}</View>
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

function StudentOnboarding({ value, onChange }: { readonly value: OnboardingResponse; readonly onChange: (next: OnboardingResponse) => void }) {
  const { apiRepository } = useMock()
  const [classId, setClassId] = useState(value.classOptions[0]?.id ?? '')
  const [displayName, setDisplayName] = useState('')
  const [last4, setLast4] = useState('')
  const [selected, setSelected] = useState(value.selectedCourseIds[0] ?? value.electiveCourses[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const verify = async () => { setBusy(true); try { onChange(await apiRepository.verifyStudent({ classId, displayName, studentNoLast4: last4 })) } finally { setBusy(false) } }
  const enroll = async () => { setBusy(true); try { onChange(await apiRepository.enrollElectives({ courseIds: selected ? [selected] : [] })) } finally { setBusy(false) } }
  return <View className="card"><Text className="tag tag-primary">首次进入</Text><Text className="card-title" style={{ marginTop: 10 }}>绑定班级与学生身份</Text>{value.status === 'NEEDS_BINDING' ? <><Text className="card-meta">请选择班级，输入姓名和学号后四位完成一次性校验。</Text><Picker mode="selector" range={value.classOptions.map((item) => item.name)} value={Math.max(0, value.classOptions.findIndex((item) => item.id === classId))} onChange={(event) => setClassId(value.classOptions[Number(event.detail.value)]?.id ?? '')}><View className="primary-button">{value.classOptions.find((item) => item.id === classId)?.name ?? '选择班级'}</View></Picker><Input className="text-input" placeholder="姓名" value={displayName} onInput={(event) => setDisplayName(event.detail.value)} /><Input className="text-input" type="number" maxlength={4} placeholder="学号后四位" value={last4} onInput={(event) => setLast4(event.detail.value)} /><View className="primary-button" onClick={() => { if (!busy) void verify() }}>{busy ? '校验中…' : '绑定身份'}</View></> : <><Text className="card-meta">请选择本学期的选修课。</Text><Picker mode="selector" range={value.electiveCourses.map((item) => item.name)} value={Math.max(0, value.electiveCourses.findIndex((item) => item.id === selected))} onChange={(event) => setSelected(value.electiveCourses[Number(event.detail.value)]?.id ?? '')}><View className="primary-button">{value.electiveCourses.find((item) => item.id === selected)?.name ?? '选择选修课'}</View></Picker><View className="primary-button" onClick={() => { if (!busy) void enroll() }}>{busy ? '保存中…' : '完成选课'}</View></>}</View>
}

export default function HomeDashboard() {
  const { apiRepository } = useMock()
  const [today, setToday] = useState<TodayResponse | null>(null)
  const [clockOffset, setClockOffset] = useState(0)
  const [error, setError] = useState(false)
  const [onboarding, setOnboarding] = useState<OnboardingResponse | null>(null)
  const refreshToday = async () => { const value = await apiRepository.getToday(); setClockOffset(new Date(value.serverTime).getTime() - Date.now()); setToday(value) }
  useEffect(() => {
    let active = true
    void apiRepository.getToday().then((value) => { if (active) { setClockOffset(new Date(value.serverTime).getTime() - Date.now()); setToday(value) } }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [apiRepository])
  useEffect(() => { void apiRepository.getOnboarding().then((value) => { if (value.classOptions.length && value.status !== 'READY') setOnboarding(value) }).catch(() => undefined) }, [apiRepository])
  if (onboarding) return <StudentOnboarding value={onboarding} onChange={setOnboarding} />
  if (error) return <View className="empty-state"><Text className="empty-title">暂时无法读取今日安排</Text><Text className="empty-copy">请先在微信小程序完成登录；H5 预览不会伪造生产身份。</Text></View>
  if (!today) return <View className="card"><Text className="card-meta">正在读取今日安排…</Text></View>
  const list = today.todaySessions
  return <>
    {today.activeCheckin ? <HomeActiveCheckin session={today.activeCheckin} clockOffset={clockOffset} onCheckIn={refreshToday} /> : null}
    {!today.activeCheckin && today.nextSession ? <HomeNextSession session={today.nextSession} clockOffset={clockOffset} /> : null}
    {list.length ? <><View className="section-heading"><Text className="section-title">今日安排</Text><Text className="section-caption">实时数据</Text></View><HomeTodaySchedule sessions={list} /></> : <HomeEmpty />}
  </>
}
