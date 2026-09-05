import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'

export default function AttendancePage() {
  const { state } = useMock()
  return (
    <PageShell eyebrow="MY ATTENDANCE" title="我的签到" subtitle="只展示当前用户自己的签到历史。">
      <View className="stat-row"><View className="stat"><Text className="stat-value">12</Text><Text className="stat-label">签到次数</Text></View><View className="stat"><Text className="stat-value">92%</Text><Text className="stat-label">出勤率</Text></View></View>
      <View className="card"><Text className="card-title">最近记录</Text><Text className="card-meta">用户体验研究 · 今天 09:02 · 已签到</Text><Text className="card-meta">研究方法 · 昨天 09:05 · 已签到</Text><Text className="card-meta">产品工作室 · 周四 · 请假</Text></View>
      {state.currentUser.capabilities.canManageProjects ? <View className="card card-muted"><Text className="card-meta">管理员仍只在“发布”中查看班级状态；这里保持个人视角。</Text></View> : null}
      <View className="secondary-button" onClick={() => void Taro.showToast({ title: 'Mock：暂无更多记录', icon: 'none' })}>加载更多</View>
    </PageShell>
  )
}
