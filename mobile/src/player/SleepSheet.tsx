import { Text } from 'react-native'
import { SLEEP_CHOICES, sleepChoiceLabel, sleepChoiceOf, type SleepChoice, type SleepTimer } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Segments, type SegmentOption } from '../ui/Segments'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

const options: SegmentOption<SleepChoice>[] = SLEEP_CHOICES.map((choice) => ({ value: choice, label: sleepChoiceLabel(choice) }))

// 잠자기 타이머: 끔, 15·30·60분, 장면 끝
export default function SleepSheet({ sleep, onChoose, onClose }: { sleep: SleepTimer; onChoose: (choice: SleepChoice) => void; onClose: () => void }) {
  const { palette } = useSettings()
  return (
    <Sheet title="잠자기 타이머" closeLabel="잠자기 타이머 닫기" onClose={onClose}>
      <Segments label="멈출 때" options={options} value={sleepChoiceOf(sleep)} onChange={onChoose} />
      <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
        시간이 되면 그때 읽던 절을 마저 읽고 멈춰요. "장면 끝"은 지금 장면을 다 읽고 멈춰요.
      </Text>
    </Sheet>
  )
}
