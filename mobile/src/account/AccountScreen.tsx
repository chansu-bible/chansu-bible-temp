import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../auth/AuthContext'
import { apiUrl, authConfig } from '../auth/config'
import { useSettings } from '../settings/SettingsContext'
import { clearLocalRecords, useSync } from '../sync/SyncContext'
import { fonts, type Palette } from '../theme/palette'
import { ScreenHeader } from '../ui/ScreenHeader'

// 오늘이면 시각만, 다른 날이면 날짜도 붙인다.
function syncedLabel(at: number | null): string {
  if (at === null) return '아직 맞추지 않았어요'
  const date = new Date(at)
  const time = `${date.getHours()}시 ${String(date.getMinutes()).padStart(2, '0')}분`
  const today = date.toDateString() === new Date().toDateString()
  return today ? `${time}에 맞췄어요` : `${date.getMonth() + 1}월 ${date.getDate()}일 ${time}에 맞췄어요`
}

type ButtonKind = 'primary' | 'danger' | 'outline' | 'plain'

function Button({ label, kind, palette, onPress, disabled = false }: { label: string; kind: ButtonKind; palette: Palette; onPress: () => void; disabled?: boolean }) {
  const background = kind === 'primary' ? palette.accent : kind === 'danger' ? palette.warn : 'transparent'
  const color = kind === 'primary' || kind === 'danger' ? palette.paper : kind === 'plain' ? palette.inkSoft : palette.ink
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: kind === 'outline' ? palette.inkFaint : 'transparent', opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  )
}

// 로그아웃 확인 단계: 묻기, 못 올린 기록이 있어 한 번 더 묻기
type Leaving = 'none' | 'confirm' | 'unsynced'

// 로그인, 동기화 상태, 로그아웃
export default function AccountScreen() {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const auth = useAuth()
  const sync = useSync()
  const [leaving, setLeaving] = useState<Leaving>('none')
  const [busy, setBusy] = useState(false)
  const { state } = auth

  // 아직 안 올린 기록을 먼저 올려 보고, 못 올렸으면 한 번 더 묻는다.
  async function signOut(force: boolean) {
    setBusy(true)
    try {
      if (!force && sync.pending > 0 && (await sync.syncNow()) > 0) {
        setLeaving('unsynced')
        return
      }
      await auth.signOut()
      clearLocalRecords()
      setLeaving('none')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="계정과 동기화" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {state.status === 'loading' && (
          <View style={[styles.card, styles.center, { backgroundColor: palette.surface }]}>
            <ActivityIndicator color={palette.accent} />
            <Text style={[styles.body, { color: palette.inkSoft }]}>로그인 정보를 확인하고 있어요</Text>
          </View>
        )}

        {state.status === 'signedOut' && (
          <View style={[styles.card, { backgroundColor: palette.surface }]}>
            <Text style={[styles.title, { color: palette.ink }]}>로그인하면 다른 기기에서 이어 읽어요</Text>
            <Text style={[styles.body, { color: palette.inkSoft }]}>
              읽은 장면, 읽던 곳, 읽기 계획, 밑줄과 메모를 계정에 맡겨 두고 다른 기기와 맞춰요. 로그인하지 않아도 이 기기에서는 모두 쓸 수
              있어요.
            </Text>
            {state.message !== null && <Text style={[styles.body, { color: palette.warn }]}>{state.message}</Text>}
            <Button label="로그인 / 회원 가입" kind="primary" palette={palette} onPress={() => void auth.signIn()} />
          </View>
        )}

        {state.status === 'signedIn' && (
          <>
            <View style={[styles.card, { backgroundColor: palette.surface }]}>
              <Text style={[styles.caption, { color: palette.inkSoft }]}>로그인한 계정</Text>
              <Text style={[styles.title, { color: palette.ink }]}>{state.user.name ?? state.user.username ?? '이름 없음'}</Text>
              {state.user.email !== null && <Text style={[styles.body, { color: palette.inkSoft }]}>{state.user.email}</Text>}
            </View>

            <View style={[styles.card, { backgroundColor: palette.surface }]}>
              <Text style={[styles.caption, { color: palette.inkSoft }]}>기록 동기화</Text>
              <Text style={[styles.body, { color: palette.ink }]}>
                {sync.status.state === 'syncing' ? '맞추고 있어요' : syncedLabel(sync.status.lastAt)}
              </Text>
              {sync.pending > 0 && <Text style={[styles.body, { color: palette.inkSoft }]}>아직 올리지 않은 기록 {sync.pending}개</Text>}
              {sync.status.message !== null && <Text style={[styles.body, { color: palette.warn }]}>{sync.status.message}</Text>}
              <Button
                label="지금 맞추기"
                kind="outline"
                palette={palette}
                disabled={sync.status.state === 'syncing'}
                onPress={() => void sync.syncNow()}
              />
            </View>

            {leaving === 'none' ? (
              <Button label="로그아웃" kind="outline" palette={palette} onPress={() => setLeaving('confirm')} />
            ) : (
              <View style={[styles.card, { backgroundColor: palette.warnSoft }]}>
                <Text style={[styles.body, { color: palette.ink }]}>
                  {leaving === 'confirm'
                    ? `로그아웃하면 이 기기의 읽기 기록(읽은 장면, 읽던 곳, 계획, 밑줄과 메모)을 지워요. 기록은 계정에 남아 다시 로그인하면 받아 와요.${
                        sync.pending > 0 ? ` 아직 올리지 않은 기록 ${sync.pending}개는 먼저 올려요.` : ''
                      }`
                    : `서버에 연결하지 못해 기록 ${sync.pending}개를 올리지 못했어요. 지금 로그아웃하면 이 기록은 사라져요.`}
                </Text>
                <View style={styles.row}>
                  <Button label="취소" kind="plain" palette={palette} onPress={() => setLeaving('none')} />
                  <Button
                    label={leaving === 'confirm' ? '로그아웃' : '그래도 로그아웃'}
                    kind="danger"
                    palette={palette}
                    disabled={busy}
                    onPress={() => void signOut(leaving === 'unsynced')}
                  />
                </View>
              </View>
            )}
          </>
        )}

        <Text style={[styles.note, { color: palette.inkFaint }]}>{`로그인 서버 ${authConfig.issuer}\n동기화 서버 ${apiUrl}`}</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12 },
  card: { padding: 16, borderRadius: 16, gap: 10 },
  center: { alignItems: 'center' },
  caption: { fontSize: 12 },
  title: { fontFamily: fonts.serifBold, fontSize: 18 },
  body: { fontSize: 14, lineHeight: 21 },
  button: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  note: { fontSize: 11, lineHeight: 17 },
})
