import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { ProjectSummary, ScheduleRule, SessionSummary } from '@qzu/contracts'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'

const format = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(value))

export default function ProjectDetailPage() {
  const { apiRepository } = useMock()
  const id = Taro.getCurrentInstance().router?.params?.id
  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [rules, setRules] = useState<readonly ScheduleRule[]>([])
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([])
  useEffect(() => { if (id) void Promise.all([apiRepository.getProject(id), apiRepository.listSessions(id), apiRepository.listScheduleRules(id)]).then(([nextProject, nextSessions, nextRules]) => { setProject(nextProject); setSessions(nextSessions); setRules(nextRules) }) }, [apiRepository, id])
  if (!project) return <PageShell title="项目详情" subtitle="正在读取真实 API 数据…" />
  return <PageShell eyebrow="PROJECT DETAIL" title={project.name} subtitle="时间按项目时区展示；签到资格最终由 API 判断。">
    <View className="card"><Text className="card-title">基本信息</Text><Text className="card-meta">{project.type} · {project.status}</Text><Text className="card-meta">{project.description ?? '暂无描述'}</Text><Text className="card-meta">有效期：{project.effectiveStartDate} – {project.effectiveEndDate ?? '未设结束日期'}</Text><Text className="card-meta">时区：{project.timezone}</Text></View>
    <View className="section-heading"><Text className="section-title">课程 Session</Text><Text className="section-caption">{sessions.length} 个</Text></View>
    <View className="card">{sessions.slice(0, 12).map((session) => <View className="timeline-item" key={session.id} onClick={() => void Taro.navigateTo({ url: `/pages/course-detail/index?id=${session.id}` })}><Text className="timeline-time">{format(session.scheduledStartAt)}</Text><View className="timeline-dot" /><View className="timeline-body"><Text className="timeline-name">{session.projectName}</Text><Text className="timeline-location">{session.locationName ?? '地点待定'} · {session.status}</Text></View></View>)}{!sessions.length ? <Text className="card-meta">暂无已生成 Session。</Text> : null}</View>
    <View className="card card-muted"><Text className="card-title">排课规则</Text><Text className="card-meta">{rules.length ? `${rules.length} 条规则` : '规则详情将在下一次读取中展示。'}</Text></View>
  </PageShell>
}
