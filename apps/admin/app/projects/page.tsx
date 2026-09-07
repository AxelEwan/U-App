'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Project = { id: string; name: string; type: 'COURSE' | 'ACTIVITY'; status: string; description: string | null }
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3004'
const adminHeaders: HeadersInit = { 'Content-Type': 'application/json', ...(process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH === 'true' ? { 'X-Dev-User': 'admin' } : {}) }

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'COURSE' as Project['type'], startDate: new Date().toISOString().slice(0, 10), endDate: '', description: '' })
  const loadProjects = () => { void fetch(`${apiBase}/api/v1/projects`, { credentials: 'include' }).then((response) => response.json()).then((value: { items: Project[] }) => setProjects(value.items)).catch(() => setError(true)) }
  useEffect(() => { loadProjects() }, [])
  const createProject = async () => {
    if (!form.name || !form.startDate) return
    setCreating(true)
    try {
      const response = await fetch(`${apiBase}/api/v1/projects`, { method: 'POST', headers: adminHeaders, credentials: 'include', body: JSON.stringify({ name: form.name, description: form.description || null, type: form.type, timezone: 'Asia/Shanghai', effectiveStartDate: form.startDate, effectiveEndDate: form.endDate || null }) })
      if (!response.ok) throw new Error('create failed')
      setForm({ ...form, name: '', description: '' }); loadProjects()
    } catch { setError(true) } finally { setCreating(false) }
  }
  return <>
    <header className="page-header"><div><p className="eyebrow">项目管理</p><h1>Projects</h1><p className="muted">读取 Hono 业务 API 的真实项目数据。</p></div></header>
    <section className="panel compact"><h2>创建项目</h2><div className="form-grid"><label>名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：秋季课程" /></label><label>类型<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as Project['type'] })}><option value="COURSE">COURSE</option><option value="ACTIVITY">ACTIVITY</option></select></label><label>开始日期<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>结束日期<input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label><label className="wide">描述<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="可选" /></label></div><button className="button" onClick={() => void createProject()} disabled={creating || !form.name}>{creating ? '保存中…' : '保存项目'}</button></section>
    {error ? <section className="panel"><p className="muted">API 暂时不可用，请启动本地 API。</p></section> : <section className="panel table-wrap"><table><thead><tr><th>项目</th><th>类型</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{projects.map((project) => <tr key={project.id}><td>{project.name}</td><td><span className="tag">{project.type}</span></td><td>{project.status}</td><td><Link href={`/projects/${project.id}`}>查看</Link></td></tr>)}</tbody></table></section>}
  </>
}
