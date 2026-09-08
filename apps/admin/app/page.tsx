import Link from 'next/link'

import { getDevelopmentAdminSession } from '../lib/auth'
import ReadinessPanel from './ReadinessPanel'

export default function DashboardPage() {
  const session = getDevelopmentAdminSession()
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">概览</p>
          <h1>Dashboard</h1>
          <p className="muted">项目、场次和签到的管理入口。</p>
        </div>
        <span className={session ? 'status status-dev' : 'status'}>
          {session ? `Dev Auth · ${session.displayName}` : '需要生产登录'}
        </span>
      </header>
      <ReadinessPanel />
      <section className="metric-grid" aria-label="平台状态">
        <article className="metric-card"><span>项目模型</span><strong>Course + Activity</strong></article>
        <article className="metric-card"><span>业务 API</span><strong>Hono / v1</strong></article>
        <article className="metric-card"><span>数据状态</span><strong>API / Dev Repository</strong></article>
      </section>
      <section className="panel">
        <p className="eyebrow">开始管理</p>
        <h2>Projects</h2>
        <p className="muted">项目列表和详情现在从 Hono 业务 API 读取。</p>
        <Link className="button" href="/projects">查看项目</Link>
        <Link className="button button-secondary" href="/attendance">签到工作台</Link>
      </section>
    </>
  )
}
