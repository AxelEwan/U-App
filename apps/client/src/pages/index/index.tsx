import PageShell from '../../components/PageShell'
import { useMock } from '../../dev-data/context'
import HomeDashboard from './HomeDashboard'

export default function HomePage() {
  const { state } = useMock()
  return <PageShell eyebrow="QZU · DAILY" title={`早上好，${state.currentUser.displayName}`} subtitle="今天的课程和签到，都在这里。"><HomeDashboard /></PageShell>
}
