import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { getVisibleNavigation } from '../navigation/definitions'
import { useMock } from '../dev-data/context'

function currentRoute(): string {
  return Taro.getCurrentInstance().router?.path ?? '/pages/index/index'
}

export default function BottomNavigation() {
  const { state } = useMock()
  const route = currentRoute()
  const items = getVisibleNavigation(state.currentUser)

  const navigate = (path: string) => {
    if (path === route) return
    if (process.env.TARO_ENV === 'weapp') void Taro.switchTab({ url: path })
    else void Taro.navigateTo({ url: path })
  }

  return (
    <View className="bottom-navigation" role="navigation">
      {items.map((item) => (
        <View className={`bottom-navigation-item ${route === item.route ? 'is-active' : ''}`} key={item.key} onClick={() => navigate(item.route)}>
          <Text className="bottom-navigation-icon">{item.icon}</Text>
          <Text className="bottom-navigation-label">{item.label}</Text>
        </View>
      ))}
    </View>
  )
}
