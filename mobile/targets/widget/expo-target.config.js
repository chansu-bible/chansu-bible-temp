// iOS 홈 화면 위젯 "오늘의 장면"(목업 15). @bacons/apple-targets가 npx expo prebuild 때 Xcode 대상으로 만든다.
// 장면 그림은 npm run content -w mobile이 만든 작은 그림(assets/content/widget/<장면 id>.jpg)을 위젯 안 그림으로 넣는다.
const fs = require('fs')
const path = require('path')

const thumbnails = path.join(__dirname, '../../assets/content/widget')

function sceneImages() {
  if (!fs.existsSync(thumbnails)) return {}
  return Object.fromEntries(
    fs
      .readdirSync(thumbnails)
      .filter((name) => name.endsWith('.jpg'))
      .map((name) => [name.replace(/\.jpg$/, ''), path.join('../../assets/content/widget', name)]),
  )
}

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
  images: sceneImages(),
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
})
