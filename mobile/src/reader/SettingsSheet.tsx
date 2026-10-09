import type { ReactNode } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { FONT_SCALE_STEPS, type Speed, type Theme, type Verse } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import { Segments, type SegmentOption } from '../ui/Segments'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

const themeOptions: SegmentOption<Theme>[] = [
  { value: 'auto', label: '기기 따름' },
  { value: 'light', label: '밝게' },
  { value: 'dark', label: '어둡게' },
]

const speedOptions: SegmentOption<Speed>[] = [
  { value: 0.8, label: '느리게' },
  { value: 1, label: '보통' },
  { value: 1.2, label: '빠르게' },
]

// 글자 크기는 슬라이더 대신 다섯 단계 "가" 단추로 고른다(React Native에는 기본 슬라이더가 없다).
const fontOptions = FONT_SCALE_STEPS.map((step) => ({
  value: step,
  label: '가',
  accessibilityLabel: `글자 크기 5단계 중 ${step}단계`,
  textStyle: { fontSize: 11 + step * 2 },
}))

// 읽기 설정 시트. 바꾸면 바로 반영되고 이 기기에 저장된다.
export default function SettingsSheet({ verse, onClose }: { verse: Verse | undefined; onClose: () => void }) {
  const { settings, update, palette, verseScale, subtitles, setSubtitles } = useSettings()
  const previewSize = 17 * verseScale

  return (
    <Sheet title="읽기 설정" closeLabel="읽기 설정 닫기" onClose={onClose}>
      <Group title="글">
        <Segments label="글자 크기" options={fontOptions} value={settings.fontScale} onChange={(fontScale) => update({ fontScale })} />
        {verse ? (
          <Text
            style={[styles.preview, { backgroundColor: palette.paper, color: palette.ink, fontSize: previewSize, lineHeight: previewSize * 1.75 }]}
            accessibilityLabel="글자 크기 미리 보기"
          >
            <Text style={[styles.previewNumber, { color: palette.accent }]}>{verse.verse} </Text>
            {verse.text}
          </Text>
        ) : null}
        <Segments label="어두운 화면" options={themeOptions} value={settings.theme} onChange={(theme) => update({ theme })} />
      </Group>

      <Group title="낭독">
        <Segments label="속도" options={speedOptions} value={settings.speed} onChange={(speed) => update({ speed })} />
        <SwitchRow label="그림 위 자막" value={subtitles} onChange={setSubtitles} />
      </Group>

      <Group title="그림과 지도">
        <SwitchRow
          label="장소가 바뀌면 지도 보여 주기"
          value={settings.placeFlash}
          onChange={(placeFlash) => update({ placeFlash })}
        />
      </Group>

      <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
        본문은 개역한글(퍼블릭 도메인), 그림은 이 앱에서 만든 것. 설정은 이 기기에만 저장돼요.
      </Text>
    </Sheet>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const { palette } = useSettings()
  return (
    <View style={[styles.group, { borderBottomColor: palette.line }]}>
      <Text style={[styles.groupTitle, { color: palette.accent }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  )
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { palette } = useSettings()
  return (
    <View style={styles.switchRow}>
      <Text style={[styles.switchLabel, { color: palette.ink }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.accent, false: palette.line }}
        thumbColor={palette.surface}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: 10, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  groupTitle: { fontSize: 12, fontWeight: '700' },
  preview: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, fontFamily: fonts.serif, overflow: 'hidden' },
  previewNumber: { fontFamily: fonts.sans, fontSize: 11 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1, fontSize: 15 },
})
