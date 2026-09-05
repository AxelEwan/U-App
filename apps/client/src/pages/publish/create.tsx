import { Input, Switch, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'
import type { CreateTaskInput } from '../../dev-data/types'

interface CustomFieldDraft { name: string; type: 'TEXT' | 'SINGLE_SELECT' | 'MULTI_SELECT'; required: boolean }

const initialForm: CreateTaskInput = {
  name: '', description: '', type: 'COURSE', startDate: '2026-09-01', endDate: '2026-12-31', weekdays: [1], intervalWeeks: 1,
  startTime: '09:00', endTime: '10:30', checkInOpen: '08:45', checkInClose: '10:45', rosterMode: 'ROSTER', locationName: '', radiusMeters: 100, locationRequired: false, passcodeEnabled: false, customFields: [],
}

export default function CreatePublishPage() {
  const { state, apiRepository } = useMock()
  const [form, setForm] = useState<CreateTaskInput>(initialForm)
  const [customFields, setCustomFields] = useState<CustomFieldDraft[]>([])
  if (!state.currentUser.capabilities.canManageProjects) return <PageShell title="没有权限" subtitle="管理员才能创建签到任务。" />
  const update = <K extends keyof CreateTaskInput>(key: K, value: CreateTaskInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const toggleWeekday = (weekday: number) => update('weekdays', form.weekdays.includes(weekday) ? form.weekdays.filter((item) => item !== weekday) : [...form.weekdays, weekday])
  const addField = () => {
    const next = [...customFields, { name: `自定义字段 ${customFields.length + 1}`, type: 'TEXT' as const, required: false }]
    setCustomFields(next); update('customFields', next)
  }
  const submit = async () => {
    if (!form.name.trim()) { void Taro.showToast({ title: '请填写名称', icon: 'none' }); return }
    if (!form.weekdays.length) { void Taro.showToast({ title: '至少选择一天', icon: 'none' }); return }
    try {
      const project = await apiRepository.createProject({ name: form.name, description: form.description || null, type: form.type, timezone: 'Asia/Shanghai', effectiveStartDate: form.startDate, effectiveEndDate: form.endDate || null })
      const rule = await apiRepository.createScheduleRule(project.id, { weekdays: [...form.weekdays], everyNWeeks: form.intervalWeeks, localStartTime: form.startTime, localEndTime: form.endTime, effectiveStartDate: form.startDate, effectiveEndDate: form.endDate, timezone: 'Asia/Shanghai' })
      await apiRepository.saveAttendancePolicy(project.id, { rosterMode: form.rosterMode, checkInOpenMinutesBefore: 15, checkInCloseMinutesAfter: 15, locationEnabled: form.locationRequired, locationName: form.locationName || null, centerLatitude: null, centerLongitude: null, radiusMeters: form.radiusMeters || null, passcodeEnabled: false })
      await apiRepository.generateSessions(project.id, rule.id)
      void Taro.showToast({ title: '项目已保存并生成课程', icon: 'success' })
      setTimeout(() => void Taro.navigateBack(), 700)
    } catch { void Taro.showToast({ title: '保存失败，请确认 API 与数据库已启动', icon: 'none' }) }
  }
  return (
    <PageShell eyebrow="WORKSPACE" title="新建项目" subtitle="保存到 API 后生成真实课程 Session。二维码与口令暂不启用。">
      <View className="form-section"><Text className="form-section-title">基本信息</Text>
        <View className="form-field"><Text className="form-label">名称</Text><Input className="input" value={form.name} placeholder="例如：周三课程签到" onInput={(event) => update('name', event.detail.value)} /></View>
        <View className="form-field"><Text className="form-label">描述</Text><Textarea className="textarea" value={form.description} placeholder="补充签到说明（可选）" onInput={(event) => update('description', event.detail.value)} /></View>
      </View>
      <View className="form-section"><Text className="form-section-title">项目类型</Text><View className="choice-row">{(['COURSE', 'ACTIVITY'] as const).map((type) => <View className={`choice ${form.type === type ? 'is-selected' : ''}`} key={type} onClick={() => update('type', type)}>{type}</View>)}</View></View>
      <View className="form-section"><Text className="form-section-title">项目有效时间</Text><View className="form-row"><View className="form-field"><Text className="form-label">开始日期</Text><Input className="input" value={form.startDate} placeholder="YYYY-MM-DD" onInput={(event) => update('startDate', event.detail.value)} /></View><View className="form-field"><Text className="form-label">结束日期</Text><Input className="input" value={form.endDate} placeholder="YYYY-MM-DD" onInput={(event) => update('endDate', event.detail.value)} /></View></View></View>
      <View className="form-section"><Text className="form-section-title">循环规则</Text><Text className="form-label">每周指定星期</Text><View className="choice-row">{['一', '二', '三', '四', '五', '六', '日'].map((label, index) => <View className={`choice ${form.weekdays.includes(index + 1) ? 'is-selected' : ''}`} key={label} onClick={() => toggleWeekday(index + 1)}>周{label}</View>)}</View><View className="form-field"><Text className="form-label">每 N 周</Text><Input className="input" type="number" value={String(form.intervalWeeks)} onInput={(event) => update('intervalWeeks', Number(event.detail.value) || 1)} /></View><Text className="card-meta">单次活动规则可在后续迭代补充。</Text></View>
      <View className="form-section"><Text className="form-section-title">课程 / 活动时间</Text><View className="form-row"><View className="form-field"><Text className="form-label">开始时间</Text><Input className="input" value={form.startTime} placeholder="HH:mm" onInput={(event) => update('startTime', event.detail.value)} /></View><View className="form-field"><Text className="form-label">结束时间</Text><Input className="input" value={form.endTime} placeholder="HH:mm" onInput={(event) => update('endTime', event.detail.value)} /></View></View></View>
      <View className="form-section"><Text className="form-section-title">签到窗口</Text><View className="form-row"><View className="form-field"><Text className="form-label">开放</Text><Input className="input" value={form.checkInOpen} placeholder="HH:mm" onInput={(event) => update('checkInOpen', event.detail.value)} /></View><View className="form-field"><Text className="form-label">截止</Text><Input className="input" value={form.checkInClose} placeholder="HH:mm" onInput={(event) => update('checkInClose', event.detail.value)} /></View></View></View>
      <View className="form-section"><Text className="form-section-title">名单模式</Text><View className="choice-row">{(['ROSTER', 'FREE_FORM', 'MIXED'] as const).map((mode) => <View className={`choice ${form.rosterMode === mode ? 'is-selected' : ''}`} key={mode} onClick={() => update('rosterMode', mode)}>{mode}</View>)}</View><View className="secondary-button" onClick={() => void Taro.showToast({ title: '选择已有名单：Mock 占位', icon: 'none' })}>选择已有名单</View><View className="card-meta">导入名单入口 · 分组入口（本轮为 skeleton）</View></View>
      <View className="form-section"><Text className="form-section-title">签到条件</Text><View className="switch-row"><Text className="switch-copy">启用定位</Text><Switch checked={form.locationRequired} onChange={(event) => update('locationRequired', event.detail.value)} /></View><View className="switch-row"><Text className="switch-copy">启用口令</Text><Switch checked={form.passcodeEnabled} onChange={(event) => update('passcodeEnabled', event.detail.value)} /></View><View className="switch-row"><Text className="switch-copy">二维码</Text><Text className="menu-value">以后支持</Text></View>{form.passcodeEnabled ? <View className="form-field"><Text className="form-label">口令（仅 Mock 内存状态）</Text><Input className="input" password placeholder="输入口令" /></View> : null}</View>
      <View className="form-section"><Text className="form-section-title">定位</Text><View className="form-field"><Text className="form-label">地点名称</Text><Input className="input" value={form.locationName} placeholder="例如：创新楼 A201" onInput={(event) => update('locationName', event.detail.value)} /></View><View className="form-field"><Text className="form-label">半径（米）</Text><Input className="input" type="number" value={String(form.radiusMeters)} onInput={(event) => update('radiusMeters', Number(event.detail.value) || 0)} /></View><View className="secondary-button" onClick={() => void Taro.showToast({ title: '定位选择器：Mock 占位', icon: 'none' })}>打开地点选择器</View></View>
      <View className="form-section"><Text className="form-section-title">自定义字段</Text>{customFields.map((field, index) => <View className="field-item" key={`${field.name}-${index}`}><Text className="field-item-copy">{field.name} · {field.type}{field.required ? ' · 必填' : ''}</Text><Text className="link-button" onClick={() => { const next = customFields.filter((_, itemIndex) => itemIndex !== index); setCustomFields(next); update('customFields', next) }}>删除</Text></View>)}<View className="secondary-button" onClick={addField}>＋ 添加字段</View><Text className="card-meta">支持 Text / Single Select / Multi Select、必填开关和基础排序 UI。</Text></View>
      <View className="primary-button" onClick={() => void submit()}>保存并生成课程</View>
    </PageShell>
  )
}
