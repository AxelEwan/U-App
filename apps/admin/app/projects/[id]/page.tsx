'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Project = { id: string; name: string; type: string; status: string; description: string | null; timezone: string; effectiveStartDate: string; effectiveEndDate: string | null }
type Rule = { id: string; weekdays: number[]; everyNWeeks: number; localStartTime: string; localEndTime: string; effectiveStartDate: string; effectiveEndDate: string; timezone: string }
type Session = { id: string; projectName: string; scheduledStartAt: string; scheduledEndAt: string; status: string; locationName: string | null }
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3004'
const adminHeaders = { 'Content-Type': 'application/json', 'X-Dev-User': 'admin' }

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('')
  const [project, setProject] = useState<Project | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [ruleForm, setRuleForm] = useState({ weekdays: '1', startTime: '09:00', endTime: '10:30', startDate: '', endDate: '', timezone: 'Asia/Shanghai' })
  const [busy, setBusy] = useState(false)
  const loadData = (projectId: string) => { void Promise.all([fetch(`${apiBase}/api/v1/projects/${projectId}`).then((response) => response.json() as Promise<Project>), fetch(`${apiBase}/api/v1/projects/${projectId}/schedule-rules`).then((response) => response.json() as Promise<{ items: Rule[] }>), fetch(`${apiBase}/api/v1/projects/${projectId}/sessions`).then((response) => response.json() as Promise<{ items: Session[] }>) ]).then(([nextProject, nextRules, nextSessions]) => { setProject(nextProject); setRules(nextRules.items); setSessions(nextSessions.items); setRuleForm((current) => ({ ...current, startDate: current.startDate || nextProject.effectiveStartDate, endDate: current.endDate || nextProject.effectiveEndDate || nextProject.effectiveStartDate })) }) }
  useEffect(() => { void params.then(({ id: projectId }) => { setId(projectId); loadData(projectId) }) }, [params])
  const createRule = async () => {
    if (!id) return
    setBusy(true)
    try {
      const response = await fetch(`${apiBase}/api/v1/projects/${id}/schedule-rules`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ weekdays: ruleForm.weekdays.split(',').map((value) => Number(value.trim())), everyNWeeks: 1, localStartTime: ruleForm.startTime, localEndTime: ruleForm.endTime, effectiveStartDate: ruleForm.startDate, effectiveEndDate: ruleForm.endDate, timezone: ruleForm.timezone }) })
      if (!response.ok) throw new Error('rule failed')
      loadData(id)
    } finally { setBusy(false) }
  }
  const generate = async (ruleId: string) => { if (!id) return; setBusy(true); try { await fetch(`${apiBase}/api/v1/projects/${id}/sessions/generate`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ scheduleRuleId: ruleId }) }); loadData(id) } finally { setBusy(false) } }
  return <>
    <header className="page-header"><div><p className="eyebrow">Project Detail</p><h1>{project?.name ?? '项目详情'}</h1><p className="muted">ID: {id}</p></div></header>
    <section className="detail-grid">{project ? <article className="panel compact"><h2>基本信息</h2><p>{project.description ?? '暂无描述'}</p><p className="muted">{project.type} · {project.status} · {project.timezone}</p><p className="muted">有效日期：{project.effectiveStartDate} 至 {project.effectiveEndDate ?? '未设置'}</p></article> : <article className="panel compact"><p className="muted">正在读取项目…</p></article>}<article className="panel compact"><h2>添加每周规则</h2><div className="form-grid"><label>星期（1=周一）<input value={ruleForm.weekdays} onChange={(event) => setRuleForm({ ...ruleForm, weekdays: event.target.value })} /></label><label>开始时间<input type="time" value={ruleForm.startTime} onChange={(event) => setRuleForm({ ...ruleForm, startTime: event.target.value })} /></label><label>结束时间<input type="time" value={ruleForm.endTime} onChange={(event) => setRuleForm({ ...ruleForm, endTime: event.target.value })} /></label><label>开始日期<input type="date" value={ruleForm.startDate} onChange={(event) => setRuleForm({ ...ruleForm, startDate: event.target.value })} /></label><label>结束日期<input type="date" value={ruleForm.endDate} onChange={(event) => setRuleForm({ ...ruleForm, endDate: event.target.value })} /></label></div><button className="button" disabled={busy || !ruleForm.startDate || !ruleForm.endDate} onClick={() => void createRule()}>保存规则</button></article></section>
    <section className="panel compact"><h2>规则与 Session</h2>{rules.map((rule) => <div className="timeline-item" key={rule.id}><div className="timeline-body"><strong>{rule.weekdays.join(',')} · {rule.localStartTime}–{rule.localEndTime}</strong><p className="muted">{rule.effectiveStartDate} 至 {rule.effectiveEndDate}</p></div><button className="button" disabled={busy} onClick={() => void generate(rule.id)}>生成 Sessions</button></div>)}{!rules.length ? <p className="muted">暂无规则。</p> : null}<p className="muted">已生成 {sessions.length} 个 Session。</p>{sessions.slice(0, 20).map((session) => <div className="timeline-item" key={session.id}><span>{new Date(session.scheduledStartAt).toLocaleString('zh-CN')}</span><span>{session.locationName ?? '地点待定'} · {session.status}</span></div>)}</section>
    <Link href="/projects">← 返回项目列表</Link>
  </>
}
