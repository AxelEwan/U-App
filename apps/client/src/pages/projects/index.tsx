import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

const projects = [
  { id: 'course-foundation', name: '示例课程项目', meta: 'COURSE · 结构占位' },
  { id: 'activity-foundation', name: '示例活动项目', meta: 'ACTIVITY · 结构占位' },
] as const

export default function ProjectsPage() {
  return (
    <View className="page">
      <Text className="eyebrow">PROJECTS</Text><Text className="title">我的项目</Text>
      <Text className="subtitle">M2 将从 API 加载与当前用户相关的项目。</Text>
      {projects.map((project) => (
        <View className="card" key={project.id} onClick={() => void Taro.navigateTo({ url: `/pages/project-detail/index?id=${project.id}` })}>
          <Text className="card-title">{project.name}</Text><Text className="card-meta">{project.meta}</Text>
        </View>
      ))}
    </View>
  )
}
