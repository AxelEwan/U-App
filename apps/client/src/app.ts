import { createElement, type PropsWithChildren } from 'react'

import './app.css'

import { MockProvider } from './dev-data/context'

export default function App({ children }: PropsWithChildren) {
  return createElement(MockProvider, null, children)
}
