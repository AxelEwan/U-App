'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3004'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`${apiBase}/api/v1/auth/admin/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      if (!response.ok) throw new Error('login failed')
      router.replace('/attendance')
      router.refresh()
    } catch { setError('登录失败，请检查管理员密码。') } finally { setBusy(false) }
  }
  return <section className="panel compact login-panel"><p className="eyebrow">ADMIN AUTH</p><h1>管理员登录</h1><p className="muted">推荐使用 X-Lab 登录；管理员密码仅作为服务器端 fallback。</p><a className="button" href={`${apiBase}/api/v1/auth/casdoor/start?mode=admin`}>使用 X-Lab 登录</a><p className="muted">或使用服务器验证的临时管理员密码。</p><label>管理员密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error ? <p className="muted">{error}</p> : null}<button className="button" disabled={busy || !password} onClick={() => void submit()}>{busy ? '验证中…' : '密码登录'}</button></section>
}
