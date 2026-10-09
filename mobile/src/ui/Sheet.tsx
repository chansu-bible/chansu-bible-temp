import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import { IconButton } from './IconButton'

type Props = {
  // 제목 글 또는 직접 그린 머리. 둘 다 없으면 닫기 단추만 있다.
  title?: string
  header?: ReactNode
  closeLabel: string
  onClose: () => void
  children: ReactNode
  // 시트 안을 스크롤해야 할 때(원어 시트가 누른 낱말의 사전 항목으로 옮긴다)
  scrollRef?: RefObject<ScrollView | null>
}

// 아래에서 올라오는 시트. 바탕을 누르면 닫힌다. 안드로이드 뒤로 가기는 ReaderScreen이 처리한다.
export function Sheet({ title, header, closeLabel, onClose, children, scrollRef }: Props) {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const offset = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.timing(offset, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start()
  }, [offset])

  const translateY = offset.interpolate({ inputRange: [0, 1], outputRange: [0, 400] })

  return (
    // 메모를 쓸 때 키보드가 시트를 가리지 않게 한다(iOS. 안드로이드는 화면이 저절로 줄어든다).
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root} accessibilityViewIsModal>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
      <Animated.View
        style={[styles.sheet, { backgroundColor: palette.surface, paddingBottom: 24 + insets.bottom, transform: [{ translateY }] }]}
      >
        <View style={styles.head}>
          <View style={styles.headText}>
            {header ??
              (title ? (
                <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
                  {title}
                </Text>
              ) : null)}
          </View>
          <IconButton name="close" label={closeLabel} color={palette.ink} onPress={onClose} />
        </View>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: { maxHeight: '80%', paddingTop: 12, paddingHorizontal: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 4 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.serifBold, fontSize: 18 },
  body: { gap: 12, paddingBottom: 4 },
})
