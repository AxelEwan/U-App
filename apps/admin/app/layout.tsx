import Link from 'next/link'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './styles.css'

export const metadata: Metadata = {
  title: 'QZU 管理平台',
  description: '课程与活动项目管理',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="app-frame">
          <aside className="sidebar">
            <Link className="brand" href="/">
              <span className="brand-mark">Q</span>
              <span>QZU Admin</span>
            </Link>
            <nav aria-label="主导航">
              <Link href="/">Dashboard</Link>
              <Link href="/projects">Projects</Link>
              <Link href="/attendance">签到工作台</Link>
              <Link href="/login">管理员登录</Link>
            </nav>
            <p className="sidebar-note">M1 · 安全基础已启用</p>
          </aside>
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  )
}
