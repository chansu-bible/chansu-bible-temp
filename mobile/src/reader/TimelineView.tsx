import { Pressable, StyleSheet, Text, View } from 'react-native'
import { timelineLayout, type Character, type Entity, type Era } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts, withAlpha } from '../theme/palette'
import { sheetStyles } from '../ui/sheetStyles'

// 연표 그림 부분의 높이(px)
const plotHeight = 360
// 왼쪽 햇수 눈금 자리의 폭(px)
const gutter = 52

type Props = {
  characters: Character[]
  eras: Era[]
  // 지금 장면에 나오는 인물 id. 진한 색으로 그린다.
  sceneCharacters: string[]
  onOpenEntity: (entity: Entity) => void
}

// 세로 연표: 위에서 아래로 창조 원년부터 햇수가 흐르고, 인물마다 산 기간을 막대로 그린다.
// 이름은 웹처럼 세로로 쓴다(글자마다 줄을 바꿈).
export default function TimelineView({ characters, eras, sceneCharacters, onOpenEntity }: Props) {
  const { palette } = useSettings()
  const layout = timelineLayout(characters, eras, { height: plotHeight })

  if (layout.bars.length === 0) {
    return <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>연표에 놓을 인물이 아직 없어요.</Text>
  }

  return (
    <View>
      <View style={styles.grid}>
        {layout.ticks.map((tick) => (
          <View key={tick.year} style={[styles.tick, { top: tick.top, borderColor: palette.line }]}>
            <Text style={[styles.tickText, { color: palette.inkFaint, backgroundColor: palette.paper }]}>{tick.year}년</Text>
          </View>
        ))}
        {layout.bands.map((band) => (
          <View
            key={band.id}
            style={[
              styles.band,
              { top: band.top, height: Math.max(2, band.height), backgroundColor: band.flood ? palette.flood : palette.accentSoft },
            ]}
          >
            <Text style={[styles.bandText, { color: band.flood ? palette.flood : palette.inkFaint, fontWeight: band.flood ? '600' : '400' }]}>
              {band.name} {band.from === band.to ? `${band.from}년` : `${band.from}~${band.to}년`}
            </Text>
          </View>
        ))}

        <View style={styles.columns}>
          {layout.bars.map((bar) => {
            const strong = sceneCharacters.includes(bar.id)
            const span = bar.died === null ? `${bar.born}년에 태어나 데려감` : `${bar.born}년 ~ ${bar.died}년`
            const open = () => onOpenEntity({ kind: 'character', id: bar.id })
            const barColor = strong ? palette.accent : withAlpha(palette.accent, 0.35)
            return (
              <View key={bar.id} style={styles.column}>
                <View style={styles.track}>
                  <Pressable
                    accessible={false}
                    onPress={open}
                    style={[
                      styles.bar,
                      { top: bar.top, height: Math.max(2, bar.height) },
                      bar.open
                        ? { borderColor: strong ? palette.accent : withAlpha(palette.accent, 0.55), borderWidth: 2, borderBottomWidth: 0, borderStyle: 'dashed', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
                        : { backgroundColor: barColor },
                    ]}
                  />
                  {bar.open && (
                    <Text style={[styles.taken, { top: bar.top + bar.height, color: palette.inkFaint }]}>데려감</Text>
                  )}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${bar.name}, 창조 원년 기준 ${span}${strong ? ', 이 장면에 나와요' : ''}. 인물 카드 보기`}
                  onPress={open}
                  style={styles.name}
                >
                  <Text style={[styles.nameText, { color: strong ? palette.ink : palette.inkSoft, fontFamily: strong ? fonts.serifBold : fonts.serif }]}>
                    {[...bar.name].join('\n')}
                  </Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      </View>
      <Text style={[sheetStyles.note, styles.note, { color: palette.inkFaint }]}>
        창조 원년 기준. 5장의 나이를 더해 계산했고 번역·사본에 따라 다를 수 있어요.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { position: 'relative', marginTop: 12, paddingLeft: gutter },
  tick: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  tickText: { position: 'absolute', left: 0, top: -8, paddingRight: 4, fontSize: 11 },
  band: { position: 'absolute', left: gutter, right: 0 },
  bandText: { position: 'absolute', right: 0, bottom: 2, fontSize: 11 },
  columns: { flexDirection: 'row', gap: 2 },
  column: { flex: 1, minWidth: 0, alignItems: 'center' },
  track: { position: 'relative', width: '100%', height: plotHeight },
  bar: { position: 'absolute', left: '50%', width: 10, marginLeft: -5, borderRadius: 5 },
  taken: { position: 'absolute', alignSelf: 'center', fontSize: 10 },
  name: { marginTop: 6, paddingVertical: 2 },
  nameText: { fontSize: 13, lineHeight: 15, textAlign: 'center' },
  note: { marginTop: 16 },
})
