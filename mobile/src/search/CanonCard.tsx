import { Text, View } from 'react-native'
import { paragraphs, type Era, type Thing } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

// 검색에서 연 시대·물건 카드(인물·장소는 읽기 화면과 같은 EntityCard를 쓴다)
export default function CanonCard({ item, onClose }: { item: { kind: 'era'; era: Era } | { kind: 'thing'; thing: Thing }; onClose: () => void }) {
  const { palette } = useSettings()
  const title = item.kind === 'era' ? item.era.name : item.thing.name
  const body = paragraphs(item.kind === 'era' ? item.era.description : item.thing.description)
  return (
    <Sheet title={title} closeLabel={`${title} 카드 닫기`} onClose={onClose}>
      <Text style={[sheetStyles.note, { color: palette.accent }]}>{item.kind === 'era' ? '시대' : '물건'} · 설정집 검수됨</Text>
      <View style={sheetStyles.explanation}>
        {body.map((paragraph, index) => (
          <Text key={index} style={[sheetStyles.paragraph, { color: palette.ink }]}>
            {paragraph}
          </Text>
        ))}
      </View>
      {item.kind === 'thing' && item.thing.details.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            본문이 말하는 것
          </Text>
          {item.thing.details.map((detail, index) => (
            <Text key={index} style={[sheetStyles.term, { backgroundColor: palette.paper, color: palette.ink }]}>
              {detail}
            </Text>
          ))}
        </>
      )}
      {item.kind === 'era' && (
        <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
          본문 범위 {item.era.range.from} ~ {item.era.range.to}
        </Text>
      )}
      {item.kind === 'thing' && item.thing.sources.length > 0 && (
        <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>본문 근거: {item.thing.sources.join(', ')}</Text>
      )}
    </Sheet>
  )
}
