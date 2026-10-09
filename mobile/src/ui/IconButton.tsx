import { Pressable, StyleSheet } from 'react-native'
import { useSettings } from '../settings/SettingsContext'
import Icon, { type IconName } from './Icon'

type IconButtonProps = {
  name: IconName
  label: string
  color: string
  onPress: () => void
  size?: number
}

// 테두리 없는 40×40 아이콘 단추
export function IconButton({ name, label, color, onPress, size = 22 }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  )
}

type RoundButtonProps = {
  name: IconName
  label: string
  onPress: () => void
  // 소리가 없는 절의 재생처럼 누를 수 없을 때 흐리게 둔다.
  disabled?: boolean
  // 켜고 끄는 단추(자막)가 켜져 있을 때
  toggled?: boolean
}

// 그림 위에 뜨는 둥근 단추
export function RoundButton({ name, label, onPress, disabled = false, toggled }: RoundButtonProps) {
  const { palette } = useSettings()
  const on = toggled === true
  return (
    <Pressable
      accessibilityRole={toggled === undefined ? 'button' : 'switch'}
      accessibilityLabel={label}
      accessibilityState={{ disabled, checked: toggled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: on ? palette.accent : palette.floatBg },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Icon name={name} color={on ? palette.paper : palette.ink} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.45 },
})
