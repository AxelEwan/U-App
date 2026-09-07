import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { ProjectSummary } from '@qzu/contracts'

import { useMock } from '../../dev-data/context'

const mockProjects = [
  { id: 'course-foundation', name: '示例课程项目', meta: 'COURSE · 结构占位' },
  { id: 'activity-foundation', name: '示例活动项目', meta: 'ACTIVITY · 结构占位' },
] as const

export default function ProjectsPage() {
  const { apiRepository, isDevelopment } = useMock()
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  useEffect(() => { if (!isDevelopment) void apiRepository.listProjects().then(setProjects).catch(() => setProjects([])) }, [apiRepository, isDevelopment])
  const visibleProjects = isDevelopment ? mockProjects : projects
  return (
    <View className="page">
      <Text className="eyebrow">PROJECTS</Text><Text className="title">我的项目</Text>
      <Text className="subtitle">{isDevelopment ? '开发预览项目。' : '从 API 加载真实项目。'}</Text>
      {visibleProjects.map((project) => (
        <View className="card" key={project.id} onClick={() => void Taro.navigateTo({ url: `/pages/project-detail/index?id=${project.id}` })}>
          <Text className="card-title">{project.name}</Text><Text className="card-meta">{isDevelopment ? project.meta : `${project.type} · ${project.status}`}</Text>
        </View>
      ))}{!visibleProjects.length ? <View className="empty-state"><Text className="empty-title">暂无真实项目</Text><Text className="empty-copy">管理员发布课程后会显示在这里。</Text></View> : null}
    </View>
  )
}
