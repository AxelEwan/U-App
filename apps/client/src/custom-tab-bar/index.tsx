import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { getVisibleNavigation } from '../navigation/definitions'
import { useMock } from '../dev-data/context'

export default function CustomTabBar() {
  const { state } = useMock()
  const currentPath = Taro.getCurrentInstance().router?.path ?? '/pages/index/index'
  const items = getVisibleNavigation(state.currentUser)
  return (
    <View className="custom-tab-bar">
      {items.map((item) => (
        <View className={`custom-tab-bar-item ${currentPath === item.route ? 'is-active' : ''}`} key={item.key} onClick={() => void Taro.switchTab({ url: item.route })}>
          <Text className="bottom-navigation-icon">{item.icon}</Text>
          <Text className="bottom-navigation-label">{item.label}</Text>
        </View>
      ))}
    </View>
  )
}
