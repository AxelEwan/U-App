import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'

export default function ProfilePage() {
  const { state, repository, isDevelopment } = useMock()
  const isAdmin = state.currentUser.capabilities.canManageProjects
  return (
    <PageShell eyebrow="ACCOUNT" title="我的" subtitle="账户信息、签到统计和应用设置。">
      <View className="profile-top"><View className="avatar">{isAdmin ? '管' : '我'}</View><View className="profile-copy"><Text className="profile-name">{state.currentUser.displayName}</Text><Text className="profile-id">Internal User ID · {state.currentUser.id}</Text></View><Text className={`tag ${isAdmin ? 'tag-primary' : 'tag-success'}`}>{state.currentUser.roleLabel}</Text></View>
      {isDevelopment ? <><View className="section-heading"><Text className="section-title">开发身份切换</Text><Text className="section-caption">仅开发预览</Text></View><View className="choice-row"><View className={`choice ${!isAdmin ? 'is-selected' : ''}`} onClick={() => repository.setRole('STUDENT')}>STUDENT</View><View className={`choice ${isAdmin ? 'is-selected' : ''}`} onClick={() => repository.setRole('ADMIN')}>ADMIN</View></View><View className="stat-row"><View className="stat"><Text className="stat-value">12</Text><Text className="stat-label">签到次数</Text></View><View className="stat"><Text className="stat-value">92%</Text><Text className="stat-label">出勤率</Text></View></View></> : <View className="card card-muted"><Text className="card-meta">生产环境身份由服务端会话提供；H5 尚未登录时不会显示或模拟学生数据。</Text></View>}
      <View className="menu-list"><View className="menu-item" onClick={() => void Taro.navigateTo({ url: '/pages/attendance/index' })}><Text>我的签到</Text><Text className="menu-value">›</Text></View><View className="menu-item"><Text>账号与绑定</Text><Text className="menu-value">微信账号 · X-Lab Account · skeleton</Text></View><View className="menu-item"><Text>通知设置</Text><Text className="menu-value">›</Text></View><View className="menu-item"><Text>隐私设置</Text><Text className="menu-value">›</Text></View><View className="menu-item"><Text>关于</Text><Text className="menu-value">QZU M1.5</Text></View></View>
      {isDevelopment ? <View className="card card-muted"><Text className="card-meta">开发预览使用 Mock 身份；生产构建不会发送开发身份 header。</Text></View> : null}
    </PageShell>
  )
}
