'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Project = { id: string; name: string; type: 'COURSE' | 'ACTIVITY'; status: string; description: string | null }
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3004'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState(false)
  useEffect(() => { void fetch(`${apiBase}/api/v1/projects`).then((response) => response.json()).then((value: { items: Project[] }) => setProjects(value.items)).catch(() => setError(true)) }, [])
  return <>
    <header className="page-header"><div><p className="eyebrow">项目管理</p><h1>Projects</h1><p className="muted">读取 Hono 业务 API 的真实项目数据。</p></div><button className="button" disabled>创建项目</button></header>
    {error ? <section className="panel"><p className="muted">API 暂时不可用，请启动本地 API。</p></section> : <section className="panel table-wrap"><table><thead><tr><th>项目</th><th>类型</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{projects.map((project) => <tr key={project.id}><td>{project.name}</td><td><span className="tag">{project.type}</span></td><td>{project.status}</td><td><Link href={`/projects/${project.id}`}>查看</Link></td></tr>)}</tbody></table></section>}
  </>
}
