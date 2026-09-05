'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Project = { id: string; name: string; type: string; status: string; description: string | null; timezone: string; effectiveStartDate: string; effectiveEndDate: string | null }
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3004'

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('')
  const [project, setProject] = useState<Project | null>(null)
  useEffect(() => { void params.then(({ id: projectId }) => { setId(projectId); return fetch(`${apiBase}/api/v1/projects/${projectId}`).then((response) => response.json()).then(setProject) }) }, [params])
  return <>
    <header className="page-header"><div><p className="eyebrow">Project Detail</p><h1>{project?.name ?? '项目详情'}</h1><p className="muted">ID: {id}</p></div></header>
    <section className="detail-grid">{project ? <article className="panel compact"><h2>基本信息</h2><p>{project.description ?? '暂无描述'}</p><p className="muted">{project.type} · {project.status} · {project.timezone}</p><p className="muted">有效日期：{project.effectiveStartDate} 至 {project.effectiveEndDate ?? '未设置'}</p></article> : <article className="panel compact"><p className="muted">正在读取项目…</p></article>}<article className="panel compact"><h2>Schedule / Attendance</h2><p className="muted">场次和签到管理沿用同一 Hono API 边界。</p></article></section>
    <Link href="/projects">← 返回项目列表</Link>
  </>
}
