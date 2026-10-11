// iOS 홈 화면 위젯 "오늘의 장면"(목업 15). @bacons/apple-targets가 npx expo prebuild 때 Xcode 대상으로 만든다.
// 장면 그림은 앱이 App Group에 적어 준다(mobile/src/widgets/updateWidgets.tsx). 위젯 안에 그림을 넣지 않아 확장이 가볍다.

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'TodaySceneWidget',
  displayName: '오늘의 장면',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: { light: '#faf7f2', dark: '#2a2521' },
    $accent: { light: '#8a5a2b', dark: '#d6a56f' },
    widgetBackground: { light: '#faf7f2', dark: '#2a2521' },
    widgetInk: { light: '#2b2622', dark: '#efe9e0' },
    widgetInkSoft: { light: '#6f665e', dark: '#b8ad9f' },
    widgetAccent: { light: '#8a5a2b', dark: '#d6a56f' },
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
})
