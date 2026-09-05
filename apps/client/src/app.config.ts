export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/schedule/index',
    'pages/workspace/index',
    'pages/workspace/create',
    'pages/workspace/session',
    'pages/profile/index',
    'pages/course-detail/index',
    'pages/attendance/index',
  ],
  tabBar: {
    custom: true,
    color: '#7b8497',
    selectedColor: '#2563eb',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/index/index', text: '首页' },
      { pagePath: 'pages/schedule/index', text: '课程表' },
      { pagePath: 'pages/workspace/index', text: '工作台' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ],
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#f7f8fa',
    navigationBarTitleText: 'QZU',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f7f8fa',
  },
})
