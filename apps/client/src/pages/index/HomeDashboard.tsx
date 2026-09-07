import { Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import type { OnboardingResponse, SessionSummary, TodayResponse, WebStudentClassOption } from '@qzu/contracts'

import { useCountdown } from '../../hooks/useCountdown'
import { useSessionStatus } from '../../hooks/useSessionStatus'
import { useMock } from '../../dev-data/context'

function timeRange(session: SessionSummary): string {
  const format = (value: string) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
  return `${format(session.scheduledStartAt)}–${format(session.scheduledEndAt)}`
}

function statusLabel(status: ReturnType<typeof useSessionStatus>): string {
  const labels: Record<ReturnType<typeof useSessionStatus>, string> = { UPCOMING: '未开始', CHECKIN_OPEN: '签到开放', IN_PROGRESS: '进行中', CHECKIN_CLOSED: '签到已截止', ENDED: '已结束' }
  return labels[status]
}

function WebStudentLogin() {
  const { apiRepository } = useMock()
  const [classes, setClasses] = useState<readonly WebStudentClassOption[]>([])
  const [classId, setClassId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [last4, setLast4] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const currentClass = classes.find((item) => item.id === classId) ?? classes[0]
  useEffect(() => { void apiRepository.getWebStudentLoginOptions().then((value) => { setClasses(value.classes); setClassId(value.classes[0]?.id ?? '') }).catch(() => setFailed(true)) }, [apiRepository])
  const login = async () => {
    if (!currentClass || !displayName || !/^\d{4}$/.test(last4)) return
    setBusy(true); setFailed(false)
    try {
      await apiRepository.loginWebStudent({ classId: currentClass.id, displayName, studentNoLast4: last4 })
      await Taro.reLaunch({ url: '/pages/index/index' })
    } catch { setFailed(true) } finally { setBusy(false) }
  }
  return <View className="card"><Text className="tag tag-primary">学生登录</Text><Text className="card-title" style={{ marginTop: 10 }}>绑定真实学生身份</Text><Text className="card-meta">请选择班级和姓名，再输入学号后四位。服务端只会校验真实 roster。</Text>{failed ? <Text className="card-meta">登录失败，请确认信息或稍后重试。</Text> : null}{classes.length ? <><Picker mode="selector" range={classes.map((item) => `${item.name} · ${item.classCode}`)} value={Math.max(0, classes.findIndex((item) => item.id === currentClass?.id))} onChange={(event) => { setClassId(classes[Number(event.detail.value)]?.id ?? ''); setDisplayName('') }}><View className="primary-button">{currentClass ? `${currentClass.name} · ${currentClass.classCode}` : '选择班级'}</View></Picker><Picker mode="selector" range={currentClass?.studentNames ?? []} value={Math.max(0, currentClass?.studentNames.indexOf(displayName) ?? -1)} onChange={(event) => setDisplayName(currentClass?.studentNames[Number(event.detail.value)] ?? '')}><View className="secondary-button">{displayName || '选择姓名'}</View></Picker><Input className="text-input" type="number" maxlength={4} placeholder="学号后四位" value={last4} onInput={(event) => setLast4(event.detail.value)} /><View className="primary-button" onClick={() => { if (!busy) void login() }}>{busy ? '登录中…' : '进入我的课表'}</View></> : <Text className="card-meta">当前没有可用班级 roster，请先由管理员导入。</Text>}</View>
}

function WebChallengeLogin() {
  const { apiRepository } = useMock()
  const [challenge, setChallenge] = useState<Awaited<ReturnType<typeof apiRepository.createWebLoginChallenge>> | null>(null)
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'EXPIRED' | 'ERROR'>('PENDING')
  const [busy, setBusy] = useState(false)

  const createChallenge = async () => {
    setBusy(true)
    try {
      const value = await apiRepository.createWebLoginChallenge()
      setChallenge(value)
      setStatus('PENDING')
    } catch {
      setStatus('ERROR')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void createChallenge() }, [apiRepository])
  useEffect(() => {
    if (!challenge || status !== 'PENDING') return
    let active = true
    const poll = async () => {
      try {
        const value = await apiRepository.getWebLoginChallengeStatus(challenge.challengeId)
        if (!active) return
        if (value.status === 'APPROVED') {
          setStatus('APPROVED')
          await apiRepository.consumeWebLoginChallenge(challenge.challengeId)
          await Taro.reLaunch({ url: '/pages/index/index' })
        } else if (value.status === 'EXPIRED') setStatus('EXPIRED')
      } catch { if (active) setStatus('ERROR') }
    }
    const timer = setInterval(() => { void poll() }, 2000)
    return () => { active = false; clearInterval(timer) }
  }, [apiRepository, challenge, status])

  const payload = challenge ? `https://u.x-lab.top/?webChallengeId=${encodeURIComponent(challenge.challengeId)}&webChallengeToken=${encodeURIComponent(challenge.challengeToken)}` : ''
  const copyPayload = async () => { if (payload) await Taro.setClipboardData({ data: payload }) }
  return <View className="card">
    <Text className="tag tag-primary">网页登录</Text>
    <Text className="card-title" style={{ marginTop: 10 }}>使用微信小程序确认登录</Text>
    <Text className="card-meta">打开小程序「我的 → 登录网页版」，输入下面的 4 位验证码；也可以复制扫码内容后在小程序扫码确认。</Text>
    {challenge ? <><Text className="card-title" style={{ marginTop: 16, textAlign: 'center' }}>{challenge.shortCode}</Text><Text className="card-meta" selectable onClick={() => { void copyPayload() }}>扫码内容（点击复制）</Text><Text className="card-meta" selectable style={{ wordBreak: 'break-all' }}>{payload}</Text><Text className="card-meta">{status === 'PENDING' ? '等待小程序确认…' : status === 'APPROVED' ? '已确认，正在进入 U-App…' : status === 'EXPIRED' ? '验证码已过期，请重新生成。' : '登录状态读取失败，请重试。'}</Text></> : <Text className="card-meta">正在生成登录验证码…</Text>}
    {(status === 'EXPIRED' || status === 'ERROR') ? <View className="primary-button" onClick={() => { if (!busy) void createChallenge() }}>{busy ? '生成中…' : '重新生成'}</View> : null}
  </View>
}

export function HomeActiveCheckin({ session, clockOffset, onCheckIn }: { readonly session: SessionSummary; readonly clockOffset: number; readonly onCheckIn: () => Promise<void> }) {
  const status = useSessionStatus(session, clockOffset)
  const countdown = useCountdown(session.checkInCloseAt, clockOffset)
  const [checking, setChecking] = useState(false)
  const handleCheckIn = async () => { setChecking(true); try { await onCheckIn(); await Taro.showToast({ title: '签到成功', icon: 'success' }) } catch { await Taro.showToast({ title: '签到失败，请稍后重试', icon: 'none' }) } finally { setChecking(false) } }
  return <View className="hero-card">
    <Text className="hero-kicker">正在进行的签到</Text>
    <Text className="card-title">{session.projectName}</Text>
    <Text className="card-meta">{timeRange(session)} · {session.locationName ?? '地点待定'}</Text>
    <Text className="card-meta">签到截止倒计时：{countdown.display} · {statusLabel(status)}</Text>
    <View className={`primary-button hero-action ${checking ? 'disabled' : ''}`} onClick={() => { if (!checking) void handleCheckIn() }}>{checking ? '签到中…' : '立即签到'}</View>
  </View>
}

export function HomeNextSession({ session, clockOffset }: { readonly session: SessionSummary; readonly clockOffset: number }) {
  const status = useSessionStatus(session, clockOffset)
  const countdown = useCountdown(session.scheduledStartAt, clockOffset)
  return <View className="card">
    <Text className="tag tag-primary">下一节课程</Text>
    <Text className="card-title" style={{ marginTop: 10 }}>{session.projectName}</Text>
    <Text className="card-meta">{countdown.display} · {timeRange(session)}</Text>
    <Text className="card-meta">{session.locationName ?? '地点待定'} · {statusLabel(status)}</Text>
  </View>
}

export function HomeTodaySchedule({ sessions }: { readonly sessions: readonly SessionSummary[] }) {
  return <View className="card">
    <Text className="card-title">今日课程</Text>
    {sessions.map((session) => <View className="timeline-item" key={session.id}>
      <Text className="timeline-time">{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(session.scheduledStartAt))}</Text>
      <View className="timeline-dot" />
      <View className="timeline-body"><Text className="timeline-name">{session.projectName}</Text><Text className="timeline-location">{timeRange(session)} · {session.locationName ?? '地点待定'}</Text></View>
    </View>)}
  </View>
}

export function HomeEmpty() {
  return <View className="empty-state"><Text className="empty-title">今天没有课程</Text><Text className="empty-copy">新的课程安排会在这里出现，今天先好好休息。</Text></View>
}

function MiniProgramLogin() {
  const { apiRepository } = useMock()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const login = async () => { setBusy(true); setFailed(false); try { await apiRepository.loginWechat(); await Taro.reLaunch({ url: '/pages/index/index' }) } catch { setFailed(true) } finally { setBusy(false) } }
  return <View className="card"><Text className="tag tag-primary">U-App</Text><Text className="card-title" style={{ marginTop: 10 }}>登录后查看你的课表</Text><Text className="card-meta">只需要微信登录，不要求头像、昵称或手机号。</Text>{failed ? <Text className="card-meta">登录失败，请稍后重试。</Text> : null}<View className="primary-button" onClick={() => { if (!busy) void login() }}>{busy ? '登录中…' : '微信登录'}</View></View>
}

interface InstallPromptEvent extends Event { readonly prompt: () => Promise<void>; readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function OnboardingFinish({ onDone }: { readonly onDone: () => void }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [notificationState, setNotificationState] = useState('未设置')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const listener = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', listener)
    return () => window.removeEventListener('beforeinstallprompt', listener)
  }, [])
  const finish = () => { Taro.setStorageSync('qzu_onboarding_guidance_done', '1'); onDone() }
  const enableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) { setNotificationState('当前环境稍后可在系统设置中开启'); return }
    const permission = await window.Notification.requestPermission()
    setNotificationState(permission === 'granted' ? '已开启' : '已跳过')
  }
  const install = async () => {
    if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null) }
    else setNotificationState('请在浏览器菜单中选择“添加到主屏幕”')
  }
  return <View className="card"><Text className="tag tag-success">设置完成</Text><Text className="card-title" style={{ marginTop: 10 }}>开启签到与上课提醒</Text><Text className="card-meta">上课提醒、签到任务提醒和签到即将结束提醒将在后续通知服务接入后生效。</Text><View className="secondary-button" onClick={() => { void enableNotifications() }}>开启通知 · {notificationState}</View><View className="secondary-button" onClick={() => { void install() }}>{installPrompt ? '添加 U-App 到桌面' : '查看添加到主屏幕指引'}</View><Text className="card-meta">iPhone：点击分享 → 添加到主屏幕 → 添加。Android / Chrome：使用浏览器菜单添加到主屏幕。</Text><View className="primary-button" onClick={finish}>以后再说，进入 U-App</View></View>
}

function StudentOnboarding({ value, onChange }: { readonly value: OnboardingResponse; readonly onChange: (next: OnboardingResponse) => void }) {
  const { apiRepository } = useMock()
  const [classId, setClassId] = useState(value.classOptions[0]?.id ?? '')
  const [displayName, setDisplayName] = useState('')
  const [last4, setLast4] = useState('')
  const [selected, setSelected] = useState(value.selectedCourseIds[0] ?? value.electiveCourses[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const verify = async () => { setBusy(true); try { onChange(await apiRepository.verifyStudent({ classId, displayName, studentNoLast4: last4 })) } finally { setBusy(false) } }
  const enroll = async () => { setBusy(true); try { onChange(await apiRepository.enrollElectives({ courseIds: selected ? [selected] : [] })) } finally { setBusy(false) } }
  return <View className="card"><Text className="tag tag-primary">首次进入</Text><Text className="card-title" style={{ marginTop: 10 }}>绑定班级与学生身份</Text>{value.status === 'NEEDS_BINDING' ? <><Text className="card-meta">请选择班级，输入姓名和学号后四位完成一次性校验。</Text><Picker mode="selector" range={value.classOptions.map((item) => item.name)} value={Math.max(0, value.classOptions.findIndex((item) => item.id === classId))} onChange={(event) => setClassId(value.classOptions[Number(event.detail.value)]?.id ?? '')}><View className="primary-button">{value.classOptions.find((item) => item.id === classId)?.name ?? '选择班级'}</View></Picker><Input className="text-input" placeholder="姓名" value={displayName} onInput={(event) => setDisplayName(event.detail.value)} /><Input className="text-input" type="number" maxlength={4} placeholder="学号后四位" value={last4} onInput={(event) => setLast4(event.detail.value)} /><View className="primary-button" onClick={() => { if (!busy) void verify() }}>{busy ? '校验中…' : '绑定身份'}</View></> : <><Text className="card-meta">请选择本学期的选修课。</Text><Picker mode="selector" range={value.electiveCourses.map((item) => item.name)} value={Math.max(0, value.electiveCourses.findIndex((item) => item.id === selected))} onChange={(event) => setSelected(value.electiveCourses[Number(event.detail.value)]?.id ?? '')}><View className="primary-button">{value.electiveCourses.find((item) => item.id === selected)?.name ?? '选择选修课'}</View></Picker><View className="primary-button" onClick={() => { if (!busy) void enroll() }}>{busy ? '保存中…' : '完成选课'}</View></>}</View>
}

export default function HomeDashboard() {
  const { apiRepository, isDevelopment } = useMock()
  const [today, setToday] = useState<TodayResponse | null>(null)
  const [clockOffset, setClockOffset] = useState(0)
  const [error, setError] = useState(false)
  const [onboarding, setOnboarding] = useState<OnboardingResponse | null>(null)
  const [showOnboardingFinish, setShowOnboardingFinish] = useState(false)
  const refreshToday = async () => { const value = await apiRepository.getToday(); setClockOffset(new Date(value.serverTime).getTime() - Date.now()); setToday(value) }
  useEffect(() => {
    let active = true
    void apiRepository.getToday().then((value) => { if (active) { setClockOffset(new Date(value.serverTime).getTime() - Date.now()); setToday(value) } }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [apiRepository])
  useEffect(() => { void apiRepository.getOnboarding().then((value) => { if (!value.classOptions.length) return; if (value.status !== 'READY') setOnboarding(value); else if (Taro.getStorageSync('qzu_onboarding_guidance_done') !== '1') setShowOnboardingFinish(true) }).catch(() => undefined) }, [apiRepository])
  const handleOnboardingChange = (value: OnboardingResponse) => { if (value.status === 'READY') { setOnboarding(null); setShowOnboardingFinish(true) } else setOnboarding(value) }
  if (onboarding) return <StudentOnboarding value={onboarding} onChange={handleOnboardingChange} />
  if (showOnboardingFinish) return <OnboardingFinish onDone={() => setShowOnboardingFinish(false)} />
  if (error) return process.env.TARO_ENV === 'weapp' ? <MiniProgramLogin /> : isDevelopment ? <WebStudentLogin /> : <WebChallengeLogin />
  if (!today) return <View className="card"><Text className="card-meta">正在读取今日安排…</Text></View>
  const list = today.todaySessions
  return <>
    {today.activeCheckin ? <HomeActiveCheckin session={today.activeCheckin} clockOffset={clockOffset} onCheckIn={refreshToday} /> : null}
    {!today.activeCheckin && today.nextSession ? <HomeNextSession session={today.nextSession} clockOffset={clockOffset} /> : null}
    {list.length ? <><View className="section-heading"><Text className="section-title">今日安排</Text><Text className="section-caption">实时数据</Text></View><HomeTodaySchedule sessions={list} /></> : <HomeEmpty />}
  </>
}
