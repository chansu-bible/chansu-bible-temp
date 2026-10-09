import { Text } from 'react-native'
import { PER_DAY_CHOICES, type PlanKind, type ReadingPlan } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Segments, type SegmentOption } from '../ui/Segments'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

const kindOptions: SegmentOption<PlanKind>[] = [
  { value: 'chapter', label: '하루 한 장' },
  { value: 'scenes', label: '하루 장면' },
  { value: 'free', label: '자유' },
]

const perDayOptions: SegmentOption<number>[] = PER_DAY_CHOICES.map((count) => ({ value: count, label: `${count}개` }))

export default function PlanSheet({ plan, onChange, onClose }: { plan: ReadingPlan; onChange: (plan: ReadingPlan) => void; onClose: () => void }) {
  const { palette } = useSettings()
  return (
    <Sheet title="읽기 계획" closeLabel="읽기 계획 닫기" onClose={onClose}>
      <Segments label="계획" options={kindOptions} value={plan.kind} onChange={(kind) => onChange({ ...plan, kind })} />
      {plan.kind === 'scenes' && (
        <Segments label="하루 장면 수" options={perDayOptions} value={plan.perDay} onChange={(perDay) => onChange({ ...plan, perDay })} />
      )}
      <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
        오늘 읽을 곳과 남은 날은 읽은 장면으로 셉니다. 하루 동안은 오늘 분량이 바뀌지 않아요. 계획은 이 기기에 저장되고, 로그인하면 다른 기기와 같아져요.
      </Text>
    </Sheet>
  )
}
