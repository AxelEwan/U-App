import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'
import HomeDashboard from './HomeDashboard'

export default function HomePage() {
  const { state } = useMock()
  const authenticated = Boolean(state.currentUser.id)
  return <PageShell eyebrow="QZU · DAILY" title={authenticated ? `早上好，${state.currentUser.displayName}` : 'U-App'} subtitle={authenticated ? '今天的课程和签到，都在这里。' : '登录后查看你的真实课程和签到。'}><HomeDashboard /></PageShell>
}
