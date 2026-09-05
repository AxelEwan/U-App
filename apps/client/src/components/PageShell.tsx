import { Text, View } from '@tarojs/components'
import type { PropsWithChildren } from 'react'

import BottomNavigation from './BottomNavigation'

interface PageShellProps extends PropsWithChildren {
  readonly eyebrow?: string
  readonly title: string
  readonly subtitle?: string
  readonly className?: string
}

export default function PageShell({ eyebrow, title, subtitle, className, children }: PageShellProps) {
  return (
    <View className={`page ${className ?? ''}`}>
      <View className="page-header">
        {eyebrow ? <Text className="eyebrow">{eyebrow}</Text> : null}
        <Text className="title">{title}</Text>
        {subtitle ? <Text className="subtitle">{subtitle}</Text> : null}
      </View>
      <View className="page-content">{children}</View>
      {process.env.TARO_ENV === 'weapp' ? null : <BottomNavigation />}
    </View>
  )
}
