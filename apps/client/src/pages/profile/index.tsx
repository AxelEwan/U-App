import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'

export default function ProfilePage() {
  const { state, repository } = useMock()
  const isAdmin = state.currentUser.capabilities.canManageProjects
  return (
    <PageShell eyebrow="ACCOUNT" title="我的" subtitle="账户信息、签到统计和应用设置。">
      <View className="profile-top"><View className="avatar">{isAdmin ? '管' : '我'}</View><View className="profile-copy"><Text className="profile-name">{state.currentUser.displayName}</Text><Text className="profile-id">Internal User ID · {state.currentUser.id}</Text></View><Text className={`tag ${isAdmin ? 'tag-primary' : 'tag-success'}`}>{state.currentUser.roleLabel}</Text></View>
      <View className="section-heading"><Text className="section-title">Mock Auth 快速切换</Text><Text className="section-caption">仅开发预览</Text></View>
      <View className="choice-row"><View className={`choice ${!isAdmin ? 'is-selected' : ''}`} onClick={() => repository.setRole('STUDENT')}>STUDENT</View><View className={`choice ${isAdmin ? 'is-selected' : ''}`} onClick={() => repository.setRole('ADMIN')}>ADMIN</View></View>
      <View className="stat-row"><View className="stat"><Text className="stat-value">12</Text><Text className="stat-label">签到次数</Text></View><View className="stat"><Text className="stat-value">92%</Text><Text className="stat-label">出勤率</Text></View></View>
      <View className="menu-list"><View className="menu-item" onClick={() => void Taro.navigateTo({ url: '/pages/attendance/index' })}><Text>我的签到</Text><Text className="menu-value">›</Text></View><View className="menu-item"><Text>账号与绑定</Text><Text className="menu-value">微信账号 · X-Lab Account · skeleton</Text></View><View className="menu-item"><Text>通知设置</Text><Text className="menu-value">›</Text></View><View className="menu-item"><Text>隐私设置</Text><Text className="menu-value">›</Text></View><View className="menu-item"><Text>关于</Text><Text className="menu-value">QZU M1.5</Text></View></View>
      <View className="card card-muted"><Text className="card-meta">登录、账号绑定与通知能力仍保持在明确的 Mock / skeleton 边界内，未连接真实微信或 Casdoor。</Text></View>
    </PageShell>
  )
}
