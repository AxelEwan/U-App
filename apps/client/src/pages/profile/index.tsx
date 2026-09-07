import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { useEffect } from 'react'
import type { MeResponse } from '@qzu/contracts'

import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'

function WebLoginApproval() {
  const { apiRepository } = useMock()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const approveCode = async () => {
    if (!/^\d{4}$/.test(code)) return
    setBusy(true); setMessage('')
    try { await apiRepository.approveWebLoginChallengeByCode(code); setMessage('已确认网页登录。') } catch { setMessage('验证码无效、已过期或已使用。') } finally { setBusy(false) }
  }
  const scan = async () => {
    setBusy(true); setMessage('')
    try {
      const result = await Taro.scanCode({ onlyFromCamera: false })
      const idMatch = /[?&]webChallengeId=([^&]+)/.exec(result.result)
      const tokenMatch = /[?&]webChallengeToken=([^&]+)/.exec(result.result)
      if (idMatch && tokenMatch) await apiRepository.approveWebLoginChallenge(decodeURIComponent(idMatch[1]!), decodeURIComponent(tokenMatch[1]!))
      else if (/^\d{4}$/.test(result.result)) await apiRepository.approveWebLoginChallengeByCode(result.result)
      else throw new Error('INVALID_CHALLENGE')
      setMessage('已确认网页登录。')
    } catch { setMessage('扫码内容无效、已过期或已使用。') } finally { setBusy(false) }
  }
  return <View className="card"><Text className="card-title">登录网页版</Text><Text className="card-meta">在浏览器打开 U-App 后，输入 4 位验证码，或扫描浏览器显示的登录内容。</Text><View className="form-row"><Input className="text-input" type="number" maxlength={4} placeholder="4 位验证码" value={code} onInput={(event) => setCode(event.detail.value)} /><View className="primary-button button-inline" onClick={() => { if (!busy) void approveCode() }}>{busy ? '处理中…' : '确认'}</View></View><View className="secondary-button" onClick={() => { if (!busy) void scan() }}>扫一扫确认</View>{message ? <Text className="card-meta">{message}</Text> : null}</View>
}

export default function ProfilePage() {
  const { state, repository, isDevelopment } = useMock()
  const isAdmin = state.currentUser.capabilities.canManageProjects
  const { apiRepository } = useMock()
  const [me, setMe] = useState<MeResponse | null>(null)
  useEffect(() => { void apiRepository.getMe().then(setMe).catch(() => setMe(null)) }, [apiRepository])
  const providers = new Set(me?.identityProviders ?? [])
  return (
    <PageShell eyebrow="ACCOUNT" title="我的" subtitle="账户信息、签到统计和应用设置。">
      <View className="profile-top"><View className="avatar">{isAdmin ? '管' : '我'}</View><View className="profile-copy"><Text className="profile-name">{state.currentUser.displayName}</Text><Text className="profile-id">Internal User ID · {state.currentUser.id}</Text></View><Text className={`tag ${isAdmin ? 'tag-primary' : 'tag-success'}`}>{state.currentUser.roleLabel}</Text></View>
      {isDevelopment ? <><View className="section-heading"><Text className="section-title">开发身份切换</Text><Text className="section-caption">仅开发预览</Text></View><View className="choice-row"><View className={`choice ${!isAdmin ? 'is-selected' : ''}`} onClick={() => repository.setRole('STUDENT')}>STUDENT</View><View className={`choice ${isAdmin ? 'is-selected' : ''}`} onClick={() => repository.setRole('ADMIN')}>ADMIN</View></View><View className="stat-row"><View className="stat"><Text className="stat-value">12</Text><Text className="stat-label">签到次数</Text></View><View className="stat"><Text className="stat-value">92%</Text><Text className="stat-label">出勤率</Text></View></View></> : <View className="card card-muted"><Text className="card-meta">生产环境身份由服务端会话提供；H5 尚未登录时不会显示或模拟学生数据。</Text></View>}
      <View className="menu-list"><View className="menu-item" onClick={() => void Taro.navigateTo({ url: '/pages/attendance/index' })}><Text>我的签到</Text><Text className="menu-value">›</Text></View><View className="menu-item"><Text>微信</Text><Text className="menu-value">{providers.has('WECHAT_MINIPROGRAM') ? '已绑定' : '未绑定'}</Text></View><View className="menu-item"><Text>X-Lab</Text><Text className="menu-value">{providers.has('CASDOOR') ? '已绑定' : '可绑定'}</Text></View><View className="menu-item"><Text>通知设置</Text><Text className="menu-value">›</Text></View><View className="menu-item"><Text>隐私设置</Text><Text className="menu-value">›</Text></View><View className="menu-item"><Text>关于</Text><Text className="menu-value">QZU M1.5</Text></View></View>
      {process.env.TARO_ENV === 'weapp' && !isAdmin && state.currentUser.id ? <WebLoginApproval /> : null}
      {isDevelopment ? <View className="card card-muted"><Text className="card-meta">开发预览使用 Mock 身份；生产构建不会发送开发身份 header。</Text></View> : null}
    </PageShell>
  )
}
