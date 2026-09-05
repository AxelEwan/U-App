import Taro from '@tarojs/taro'

import type { AuthProvider, ClientAuthSession, LocationEvidence, LocationProvider, ShareProvider } from './types'

export class WechatAuthProvider implements AuthProvider {
  public async signIn(): Promise<ClientAuthSession> {
    const result = await Taro.login()
    if (!result.code) throw new Error('WECHAT_LOGIN_CODE_MISSING')
    throw new Error('WECHAT_AUTH_NOT_CONFIGURED')
  }

  public currentSession(): Promise<ClientAuthSession | null> {
    return Promise.resolve(null)
  }

  public signOut(): Promise<void> {
    return Promise.resolve()
  }
}

export class WechatLocationProvider implements LocationProvider {
  public async getCurrentLocation(): Promise<LocationEvidence> {
    const location = await Taro.getLocation({ type: 'gcj02' })
    return { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy }
  }
}

export class BrowserLocationProvider implements LocationProvider {
  public getCurrentLocation(): Promise<LocationEvidence> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.reject(new Error('GEOLOCATION_UNAVAILABLE'))
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
        reject,
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
      )
    })
  }
}

export class WechatShareProvider implements ShareProvider {
  public share(): Promise<void> {
    return Promise.resolve()
  }
}

export class BrowserShareProvider implements ShareProvider {
  public async share(input: { title: string; path: string }): Promise<void> {
    if (navigator.share) await navigator.share({ title: input.title, url: input.path })
  }
}
