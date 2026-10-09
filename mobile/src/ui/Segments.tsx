import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native'
import { useSettings } from '../settings/SettingsContext'

export type SegmentOption<T> = { value: T; label: string; accessibilityLabel?: string; textStyle?: TextStyle }

// 여럿 중 하나를 고르는 분할 단추(읽기 설정)
export function Segments<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const { palette } = useSettings()
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.ink }]}>{label}</Text>
      <View
        style={[styles.segments, { borderColor: palette.line, backgroundColor: palette.paper }]}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
      >
        {options.map((option) => {
          const checked = option.value === value
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
              onPress={() => onChange(option.value)}
              style={[styles.segment, checked && { backgroundColor: palette.surface }]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: checked ? palette.ink : palette.inkSoft, fontWeight: checked ? '600' : '400' },
                  option.textStyle,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { fontSize: 15 },
  segments: { flexDirection: 'row', padding: 3, borderWidth: 1, borderRadius: 10 },
  segment: { minWidth: 36, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13 },
})
