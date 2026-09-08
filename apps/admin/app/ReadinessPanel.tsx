'use client'

import { useCallback, useEffect, useState } from 'react'

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3004'

type Readiness = { status: 'ready' | 'not_ready'; database: 'ok' | 'unavailable' | 'not_required'; schema: 'ok' | 'incomplete' | 'unavailable' | 'not_required' }

export default function ReadinessPanel() {
  const [state, setState] = useState<Readiness | null>(null)
  const [networkError, setNetworkError] = useState(false)
  const [busy, setBusy] = useState(false)
  const check = useCallback(async () => {
    setBusy(true); setNetworkError(false)
    try {
      const response = await fetch(`${apiBase}/ready`, { credentials: 'include', cache: 'no-store' })
      const value = await response.json() as Readiness
      setState(value)
    } catch { setNetworkError(true); setState(null) } finally { setBusy(false) }
  }, [])
  useEffect(() => { void check() }, [check])
  const apiLabel = networkError ? '无法连接' : state?.status === 'ready' ? '正常' : state ? '未就绪' : '检测中'
  const databaseLabel = networkError ? '未知' : state?.database === 'ok' ? '正常' : state?.database === 'not_required' ? '开发模式' : state ? '未就绪' : '检测中'
  return <section className="panel"><div className="task-header"><div><p className="eyebrow">SYSTEM STATUS</p><h2>运行状态</h2></div><button className="button button-secondary" disabled={busy} onClick={() => void check()}>{busy ? '检测中…' : '重新检测'}</button></div><div className="metric-grid"><article className="metric-card"><span>API 状态</span><strong>{apiLabel}</strong></article><article className="metric-card"><span>数据库状态</span><strong>{databaseLabel}</strong></article></div>{state?.status !== 'ready' && !networkError ? <p className="muted">课程数据正在初始化，请完成 migration 和核心数据导入。</p> : null}{networkError ? <p className="muted">服务暂时无法连接，请稍后重试。</p> : null}</section>
}
