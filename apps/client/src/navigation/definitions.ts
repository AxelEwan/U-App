export interface ClientCapabilities {
  readonly canManageProjects: boolean
}

export interface CurrentUser {
  readonly id: string
  readonly displayName: string
  readonly roleLabel: string
  readonly capabilities: ClientCapabilities
}

export interface NavigationDefinition {
  readonly key: 'home' | 'schedule' | 'workspace' | 'profile'
  readonly label: string
  readonly icon: string
  readonly route: string
  readonly requires?: keyof ClientCapabilities
}

export const navigationDefinitions: readonly NavigationDefinition[] = [
  { key: 'home', label: '首页', icon: '⌂', route: '/pages/index/index' },
  { key: 'schedule', label: '课程表', icon: '▦', route: '/pages/schedule/index' },
  { key: 'workspace', label: '工作台', icon: '＋', route: '/pages/workspace/index', requires: 'canManageProjects' },
  { key: 'profile', label: '我的', icon: '○', route: '/pages/profile/index' },
]

export function getVisibleNavigation(user: CurrentUser): readonly NavigationDefinition[] {
  return navigationDefinitions.filter((item) => !item.requires || user.capabilities[item.requires])
}
