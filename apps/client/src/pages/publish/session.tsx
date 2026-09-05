import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'
import type { MockMemberStatus } from '../../dev-data/types'

function statusText(status: MockMemberStatus): string {
  return ({ PRESENT: '已签到', PENDING: '未签到', LEAVE: '请假', ABSENT: '旷课' })[status]
}

function statusClass(status: MockMemberStatus): string {
  return ({ PRESENT: 'tag-success', PENDING: 'tag-warning', LEAVE: 'tag-primary', ABSENT: 'tag-danger' })[status]
}

export default function PublishSessionPage() {
  const { state, repository } = useMock()
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const taskId = Taro.getCurrentInstance().router?.params?.id
  const task = state.publishTasks.find((item) => item.id === taskId) ?? state.publishTasks[0]
  if (!task) return <PageShell title="Session 详情" subtitle="暂无 Mock 数据。" />
  const selectedMember = task.members.find((member) => member.id === selectedMemberId)
  const apply = (status: MockMemberStatus) => {
    if (selectedMember) repository.updateMemberStatus(task.id, selectedMember.id, status)
    setSelectedMemberId(null)
  }
  return (
    <PageShell eyebrow="SESSION DETAIL" title={task.name} subtitle="管理员视角的签到统计与成员状态。">
      <View className="card"><Text className="card-title">Session 基本信息</Text><Text className="card-meta">{task.sessionLabel}</Text><Text className="card-meta">地点：{task.location}</Text><View className="stat-row"><View className="stat"><Text className="stat-value">{task.checkedInCount}</Text><Text className="stat-label">已签到</Text></View><View className="stat"><Text className="stat-value">{task.totalCount || '—'}</Text><Text className="stat-label">总人数</Text></View><View className="stat"><Text className="stat-value">{task.members.length}</Text><Text className="stat-label">Mock 样本</Text></View></View></View>
      <View className="section-heading"><Text className="section-title">成员状态</Text><Text className="section-caption">点击成员管理状态</Text></View>
      <View className="card">{task.members.length ? task.members.map((member) => <View className="member-row" key={member.id}><Text className="member-name">{member.displayName}</Text><View onClick={() => setSelectedMemberId(member.id)}><Text className={`tag ${statusClass(member.status)}`}>{statusText(member.status)} · 管理</Text></View></View>) : <View className="empty-state"><Text className="empty-title">暂无名单成员</Text><Text className="empty-copy">FREE_FORM 任务允许成员自行加入。</Text></View>}</View>
      {selectedMember ? <View className="modal-backdrop" onClick={() => setSelectedMemberId(null)}><View className="bottom-sheet" onClick={(event) => event.stopPropagation()}><Text className="sheet-title">管理 {selectedMember.displayName}</Text><View className="sheet-action" onClick={() => apply('PRESENT')}>补签</View><View className="sheet-action" onClick={() => apply('LEAVE')}>标记请假</View><View className="sheet-action" onClick={() => apply('ABSENT')}>标记旷课</View><View className="sheet-action danger" onClick={() => apply('PENDING')}>取消当前考勤状态</View></View></View> : null}
    </PageShell>
  )
}
