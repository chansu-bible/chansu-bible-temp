import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSettings } from '../settings/SettingsContext'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

// 책 하나가 앱에 들어오기까지(파이프라인 단계와 관리 도구의 검수)
const STEPS: { title: string; detail: string }[] = [
  { title: '설정집', detail: '본문에서 인물·장소·시대·물건을 뽑고, 사람이 하나씩 검수해 승인해요.' },
  { title: '장면 글', detail: '승인된 설정집을 바탕으로 장을 장면으로 나누고, 해설과 낱말 풀이, 역사 배경을 써요.' },
  { title: '검수', detail: '쓴 모델과 다른 모델이 본문과 어긋난 곳이 없는지 다시 보고, 걸린 곳은 사람이 확인해요.' },
  { title: '그림·낭독', detail: '장면마다 정해 둔 화풍으로 그림을 그리고, 절마다 낭독 음성을 만들어요.' },
  { title: '원어·퀴즈', detail: '히브리어 낱말의 한국어 뜻과 장마다 퀴즈를 만들고, 사람이 승인한 것만 넣어요.' },
  { title: '묶음', detail: '검수를 마친 것만 모아 앱 안에 넣어요. 그래서 인터넷 없이도 읽을 수 있어요.' },
]

export default function HowWeMakeSheet({ onOpenSources, onClose }: { onOpenSources: () => void; onClose: () => void }) {
  const { palette } = useSettings()
  return (
    <Sheet title="제작 과정" closeLabel="제작 과정 닫기" onClose={onClose}>
      <Text style={[sheetStyles.paragraph, { color: palette.inkSoft }]}>모든 책이 같은 길을 거쳐요.</Text>
      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step.title} style={styles.step}>
            <View style={[styles.number, { backgroundColor: palette.accentSoft }]}>
              <Text style={[styles.numberText, { color: palette.accent }]}>{index + 1}</Text>
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepTitle, { color: palette.ink }]}>{step.title}</Text>
              <Text style={[styles.stepDetail, { color: palette.inkSoft }]}>{step.detail}</Text>
            </View>
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="link" onPress={onOpenSources} hitSlop={8}>
        <Text style={[styles.link, { color: palette.accent }]}>자료 출처와 이용 조건 보기 →</Text>
      </Pressable>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  steps: { gap: 12 },
  step: { flexDirection: 'row', gap: 12 },
  number: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 12, fontWeight: '700' },
  stepText: { flex: 1, gap: 2 },
  stepTitle: { fontSize: 14, fontWeight: '700' },
  stepDetail: { fontSize: 13, lineHeight: 20 },
  link: { fontSize: 13, fontWeight: '600' },
})
