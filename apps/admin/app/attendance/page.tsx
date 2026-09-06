'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type Project = { id: string; name: string; type: string }
type Session = { id: string; projectName: string; scheduledStartAt: string; scheduledEndAt: string; checkInOpenAt: string; checkInCloseAt: string; status: string; locationName: string | null }
type Record = { id: string; projectMemberId: string; userId: string | null; status: 'PRESENT' | 'LATE' | 'LEAVE' | 'ABSENT'; checkedInAt: string | null; voidedAt: string | null }
type LiveMember = { projectMemberId: string; displayName: string; externalCode: string | null; status: Record['status'] | 'PENDING'; checkedInAt: string | null }
type Live = { session: Session; total: number; present: number; late: number; leave: number; absent: number; pending: number; records: Record[]; members: LiveMember[] }
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3004'
const adminHeaders = { 'Content-Type': 'application/json', 'X-Dev-User': 'admin' }

export default function AttendancePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [selected, setSelected] = useState('')
  const [live, setLive] = useState<Live | null>(null)
  const [error, setError] = useState('')
  const projectByName = useMemo(() => new Map(projects.map((project) => [project.name, project])), [projects])
  useEffect(() => {
    void fetch(`${apiBase}/api/v1/projects`).then((response) => response.json() as Promise<{ items: Project[] }>).then(async (value) => {
      setProjects(value.items)
      const values = (await Promise.all(value.items.map((project) => fetch(`${apiBase}/api/v1/projects/${project.id}/sessions`).then((response) => response.json() as Promise<{ items: Session[] }>)))).flatMap((item) => item.items).sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt))
      setSessions(values); setSelected(values[0]?.id ?? '')
    }).catch(() => setError('API 暂时不可用'))
  }, [])
  const refresh = async (id = selected) => { if (!id) return; const response = await fetch(`${apiBase}/api/v1/sessions/${id}/attendance/live`, { headers: adminHeaders }); if (!response.ok) throw new Error('live failed'); setLive(await response.json() as Live) }
  useEffect(() => { if (!selected || !live) return; const timer = window.setInterval(() => { void fetch(`${apiBase}/api/v1/sessions/${selected}/attendance/live`, { headers: adminHeaders }).then((response) => response.json() as Promise<Live>).then(setLive).catch(() => undefined) }, 5000); return () => window.clearInterval(timer) }, [selected, live])
  const start = async () => { if (!selected) return; const response = await fetch(`${apiBase}/api/v1/sessions/${selected}/attendance/start`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ durationMinutes: 10 }) }); if (!response.ok) throw new Error('start failed'); await refresh() }
  const setStatus = async (projectMemberId: string, status: Record['status'] | 'VOID') => { const response = await fetch(`${apiBase}/api/v1/sessions/${selected}/attendance`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ projectMemberId, status }) }); if (!response.ok) throw new Error('update failed'); await refresh() }
  const finalize = async () => { const response = await fetch(`${apiBase}/api/v1/sessions/${selected}/attendance/finalize`, { method: 'POST', headers: adminHeaders, body: '{}' }); if (!response.ok) throw new Error('finalize failed'); setLive(await response.json() as Live) }
  const current = sessions.find((session) => session.id === selected)
  return <>
    <header className="page-header"><div><p className="eyebrow">ATTENDANCE WORKBENCH</p><h1>签到工作台</h1><p className="muted">从已发布课表直接发起 NORMAL 签到。</p></div><Link href="/">返回首页</Link></header>
    {error ? <section className="panel"><p className="muted">{error}</p></section> : null}
    <section className="panel compact"><h2>选择课表课程</h2><select value={selected} onChange={(event) => { setSelected(event.target.value); setLive(null) }}><option value="">请选择 Session</option>{sessions.map((session) => <option value={session.id} key={session.id}>{session.projectName} · {new Date(session.scheduledStartAt).toLocaleString('zh-CN')}</option>)}</select>{current ? <p className="muted">{current.locationName ?? '地点待定'} · {current.status}</p> : null}<button className="button" disabled={!selected} onClick={() => void start().catch(() => setError('发起签到失败'))}>发起签到</button><button className="button button-secondary" disabled={!selected} onClick={() => void refresh().catch(() => setError('读取签到失败'))}>刷新实时状态</button></section>
    {live ? <><section className="metric-grid"><article className="metric-card"><span>应到</span><strong>{live.total}</strong></article><article className="metric-card"><span>已到 / 迟到</span><strong>{live.present} / {live.late}</strong></article><article className="metric-card"><span>请假 / 未签到</span><strong>{live.leave} / {live.pending}</strong></article></section><section className="panel"><h2>{live.session.projectName} · 实时名单</h2><div className="table-wrap"><table><thead><tr><th>学生</th><th>学号</th><th>状态</th><th>签到时间</th><th>管理员处理</th></tr></thead><tbody>{live.members.map((member) => <tr key={member.projectMemberId}><td>{member.displayName}</td><td>{member.externalCode ?? '—'}</td><td>{member.status}</td><td>{member.checkedInAt ? new Date(member.checkedInAt).toLocaleTimeString('zh-CN') : '—'}</td><td><button className="button button-secondary" onClick={() => void setStatus(member.projectMemberId, 'PRESENT').catch(() => setError('更新失败'))}>到场</button><button className="button button-secondary" onClick={() => void setStatus(member.projectMemberId, 'LATE').catch(() => setError('更新失败'))}>迟到</button><button className="button button-secondary" onClick={() => void setStatus(member.projectMemberId, 'LEAVE').catch(() => setError('更新失败'))}>请假</button>{member.status !== 'PENDING' ? <button className="button button-secondary" onClick={() => void setStatus(member.projectMemberId, 'VOID').catch(() => setError('撤销失败'))}>撤销</button> : null}</td></tr>)}</tbody></table></div><button className="button" onClick={() => void finalize().catch(() => setError('结束签到失败'))}>结束并生成缺勤</button>{live.session ? <a className="button button-secondary" href={`${apiBase}/api/v1/sessions/${selected}/attendance.csv`} target="_blank" rel="noreferrer">导出 CSV</a> : null}</section></> : null}
    <p className="muted">当前页面使用真实 API；未使用项目创建、ScheduleRule、手工生成作为默认签到流程。{projectByName.size ? '' : ''}</p>
  </>
}
