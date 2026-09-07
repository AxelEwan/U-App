import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'

export default function AttendancePage() {
  const { isDevelopment } = useMock()
  return (
    <PageShell eyebrow="MY ATTENDANCE" title="我的签到" subtitle="只展示当前用户自己的签到历史。">
      {isDevelopment ? <><View className="stat-row"><View className="stat"><Text className="stat-value">12</Text><Text className="stat-label">签到次数</Text></View><View className="stat"><Text className="stat-value">92%</Text><Text className="stat-label">出勤率</Text></View></View><View className="card"><Text className="card-title">最近记录</Text><Text className="card-meta">用户体验研究 · 今天 09:02 · 已签到</Text><Text className="card-meta">研究方法 · 昨天 09:05 · 已签到</Text><Text className="card-meta">产品工作室 · 周四 · 请假</Text></View><View className="secondary-button" onClick={() => void Taro.showToast({ title: '开发预览：暂无更多记录', icon: 'none' })}>加载更多</View></> : <View className="empty-state"><Text className="empty-title">签到记录</Text><Text className="empty-copy">生产版记录页面将在真实身份会话下读取个人签到历史。</Text></View>}
    </PageShell>
  )
}
