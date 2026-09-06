import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { AttendanceRecord, SessionSummary } from '@qzu/contracts'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'

const format = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(value))

export default function CourseDetailPage() {
  const { apiRepository } = useMock()
  const id = Taro.getCurrentInstance().router?.params?.id
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [checking, setChecking] = useState(false)
  useEffect(() => { if (id) void Promise.all([apiRepository.getSession(id), apiRepository.getAttendance(id)]).then(([nextSession, records]) => { setSession(nextSession); setAttendance([...records]) }) }, [apiRepository, id])
  const checkIn = async () => { if (!id || checking) return; setChecking(true); try { const record = await apiRepository.checkIn(id, {}); setAttendance((current) => [...current, record]); await Taro.showToast({ title: '签到成功', icon: 'success' }) } catch { await Taro.showToast({ title: '签到失败，请确认签到窗口', icon: 'none' }) } finally { setChecking(false) } }
  if (!session) return <PageShell title="课程详情" subtitle="正在读取课程安排…" />
  return <PageShell eyebrow="COURSE DETAIL" title={session.projectName} subtitle="课程安排与签到摘要">
    <View className="card"><Text className="card-title">课程信息</Text><Text className="card-meta">时间：{format(session.scheduledStartAt)}–{format(session.scheduledEndAt)}</Text><Text className="card-meta">地点：{session.locationName ?? '地点待定'}</Text><Text className="card-meta">有效日期：由项目有效期和排课规则决定</Text></View>
    <View className="section-heading"><Text className="section-title">签到历史摘要</Text></View>
    <View className="card"><Text className="card-title">当前 Session：{session.status}</Text>{attendance.length ? <Text className="card-meta">签到状态：{attendance[0]?.status} · {attendance[0]?.checkedInAt ? format(attendance[0].checkedInAt) : '未记录时间'}</Text> : <Text className="card-meta">当前用户尚未签到。</Text>}{(session.status === 'CHECKIN_OPEN' || session.status === 'IN_PROGRESS') && !attendance.length ? <View className="primary-button hero-action" onClick={() => void checkIn()}>{checking ? '签到中…' : '立即签到'}</View> : null}</View>
  </PageShell>
}
