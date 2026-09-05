import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { SessionSummary } from '@qzu/contracts'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'

const format = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(value))

export default function CourseDetailPage() {
  const { apiRepository } = useMock()
  const id = Taro.getCurrentInstance().router?.params?.id
  const [session, setSession] = useState<SessionSummary | null>(null)
  useEffect(() => { if (id) void apiRepository.getSession(id).then(setSession) }, [apiRepository, id])
  if (!session) return <PageShell title="课程详情" subtitle="正在读取课程安排…" />
  return <PageShell eyebrow="COURSE DETAIL" title={session.projectName} subtitle="课程安排与签到摘要">
    <View className="card"><Text className="card-title">课程信息</Text><Text className="card-meta">时间：{format(session.scheduledStartAt)}–{format(session.scheduledEndAt)}</Text><Text className="card-meta">地点：{session.locationName ?? '地点待定'}</Text><Text className="card-meta">有效日期：由项目有效期和排课规则决定</Text></View>
    <View className="section-heading"><Text className="section-title">签到历史摘要</Text></View>
    <View className="card"><Text className="card-title">当前 Session：{session.status}</Text><Text className="card-meta">完整记录只对当前用户可见。</Text></View>
  </PageShell>
}
