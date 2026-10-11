import { FlexWidget, ImageWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import type { WidgetSnapshot } from 'reader-core'
import { widgetImageAssets } from '../content/assets.generated'

// 안드로이드 홈 화면 위젯 "오늘의 장면"(목업 15). 누르면 읽기 화면이 열린다. 색은 앱의 밝은 화면 색이다.
// 이 파일은 위젯 모듈이 있을 때만 불러온다(register.ts).
const play = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 4v16l13-8z" fill="#ffffff"/></svg>'

export function TodaySceneWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const image = snapshot ? widgetImageAssets[snapshot.sceneId] : undefined
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'chansubible://read' }}
      style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'row', backgroundColor: '#faf7f2', borderRadius: 24 }}
    >
      {image !== undefined && (
        <ImageWidget image={image} imageWidth={140} imageHeight={158} radius={24} resizeMode="cover" style={{ height: 'match_parent' }} />
      )}
      <FlexWidget
        style={{
          flex: 1,
          height: 'match_parent',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={snapshot?.kicker ?? '장면 성경'} style={{ fontSize: 11, color: '#6f665e' }} />
          <TextWidget
            text={snapshot?.title ?? '앱을 열면 이어 읽을 장면이 보여요'}
            maxLines={2}
            truncate="END"
            style={{ fontSize: 17, fontFamily: 'serif', fontWeight: '700', color: '#2b2622', marginTop: 4 }}
          />
          {snapshot !== null && <TextWidget text={snapshot.detail} style={{ fontSize: 12, color: '#6f665e', marginTop: 4 }} />}
        </FlexWidget>
        <FlexWidget
          style={{ flexDirection: 'row', alignItems: 'center', height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#8a5a2b' }}
        >
          <SvgWidget svg={play} style={{ width: 12, height: 12 }} />
          <TextWidget text="이어 읽기" style={{ fontSize: 12, color: '#ffffff', marginLeft: 6 }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  )
}
