import { defineConfig, type UserConfigExport } from '@tarojs/cli'

export default defineConfig<'webpack5'>((merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'qzu-client',
    date: '2026-09-05',
    designWidth: 375,
    deviceRatio: { 375: 2 },
    sourceRoot: 'src',
    outputRoot: 'dist',
    framework: 'react',
    compiler: 'webpack5',
    cache: { enable: true },
    mini: {},
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      devServer: { port: 10086 },
    },
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, { logger: { quiet: false, stats: true } })
  }
  return merge({}, baseConfig, { logger: { quiet: false, stats: false } })
})
