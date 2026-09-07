import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { ProjectSummary } from '@qzu/contracts'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'

export default function WorkspacePage() {
  const { state, apiRepository, isDevelopment } = useMock()
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [error, setError] = useState(false)
  useEffect(() => { void apiRepository.listProjects().then(setProjects).catch(() => setError(true)) }, [apiRepository])
  if (!isDevelopment) return <PageShell eyebrow="ADMIN WEB" title="请使用管理端" subtitle="生产签到工作台位于 qzu-admin.x-lab.top。客户端不会使用 Mock 身份管理签到。" />
  if (!state.currentUser.capabilities.canManageProjects) return <PageShell eyebrow="ACCESS" title="没有工作台权限" subtitle="工作台仅对具有管理能力的用户显示。"><View className="empty-state"><Text className="empty-title">请切换到 Admin 开发身份</Text><Text className="empty-copy">在“我的”页面可以切换开发角色。</Text></View></PageShell>
  return <PageShell eyebrow="WORKSPACE" title="工作台" subtitle="创建项目、生成课程 Session，查看真实 API 数据。">
    <View className="primary-button" onClick={() => void Taro.navigateTo({ url: '/pages/workspace/create' })}>＋ 新建项目</View>
    <View className="section-heading"><Text className="section-title">项目</Text><Text className="section-caption">MySQL / API</Text></View>
    {error ? <View className="empty-state"><Text className="empty-title">项目暂时不可用</Text><Text className="empty-copy">请确认 API 已启动且 Repository 可用。</Text></View> : projects.map((project) => <View className="card" key={project.id} onClick={() => void Taro.navigateTo({ url: `/pages/project-detail/index?id=${project.id}` })}><View className="task-header"><View><Text className="tag tag-primary">{project.type}</Text><Text className="card-title" style={{ marginTop: 8 }}>{project.name}</Text></View><Text className="task-count">{project.status}</Text></View><Text className="card-meta">{project.effectiveStartDate} – {project.effectiveEndDate ?? '未设结束日期'}</Text><Text className="card-meta">点击查看课程与 Session</Text></View>)}
  </PageShell>
}
