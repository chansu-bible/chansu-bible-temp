import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { askSuggestions, localDay, paragraphs, type BookId, type Bundle } from 'reader-core'
import { useAuth } from '../auth/AuthContext'
import { goBack, goToReader } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import Icon from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { AskError, fetchAskUsage, postQuestion, type AskCitation, type AskReply } from './askApi'
import { addTurn, settleTurn, useAskTurns, type Turn } from './askSession'

type Props = {
  bundle: Bundle
  // 읽고 있는 장. 제안 질문과 서버의 대목 찾기에 쓴다.
  chapterNumber: number
  // 읽기 화면에서 열었으면 'read'. 근거 표식을 누르면 뒤로 돌아가 그 자리로 옮긴다.
  from: string | undefined
}

const FOOTNOTE = '답은 본문과 검수된 해설·설정집 안에서만 만들어요. AI가 쓴 글이라 틀릴 수 있으니 근거 표식을 눌러 원문을 확인해 주세요.'

// 근거 표식을 눌러 열 수 있는지. 읽기 화면은 지금 묶음의 책만 열어서(다른 책은 3단계에서 연다), 다른 책의 본문·해설은 열지 못한다.
// 설정집은 그 자리에서 펼쳐 보이는 것이라 어느 책의 항목이든 누를 수 있다.
function opensHere(citation: AskCitation, bookId: BookId): boolean {
  return citation.kind === 'canon' || citation.book === bookId
}

// 질문하기(목업 13). 로그인한 사람만 쓴다. 서버가 검수된 자료에서 대목을 찾아 그 안에서만 답하고, 문장마다 근거를 붙인다.
export default function AskScreen({ bundle, chapterNumber, from }: Props) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const { state, signIn, accessToken } = useAuth()
  const owner = state.status === 'signedIn' ? state.user.sub : null
  const day = localDay(new Date())
  const turns = useAskTurns(owner, day)
  const busy = turns.some((turn) => turn.reply === null && turn.error === null)
  // 오늘 남은 질문 수(모르면 null)와 서버가 질문하기를 받는지. 질문에 답할 때마다 서버가 남은 수를 다시 알려 준다.
  const [remaining, setRemaining] = useState<number | null>(null)
  const [available, setAvailable] = useState(true)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // 펼친 설정집 근거: '물음 id:근거 id'
  const [openCanon, setOpenCanon] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const asked = new Set(turns.map((turn) => turn.question))
  const suggestions = useMemo(() => askSuggestions(bundle, chapterNumber), [bundle, chapterNumber]).filter(
    (question) => !asked.has(question),
  )

  // 오늘 남은 질문 수
  useEffect(() => {
    if (owner === null) return
    let alive = true
    void (async () => {
      const token = await accessToken()
      if (!alive) return
      if (!token) {
        setUsageError('서버에 연결하지 못했어요.')
        return
      }
      try {
        const result = await fetchAskUsage(token)
        if (!alive) return
        setAvailable(result.available)
        setRemaining(result.remaining)
        setUsageError(null)
      } catch (error) {
        if (alive) setUsageError(error instanceof AskError ? error.message : '남은 질문 수를 받지 못했어요.')
      }
    })()
    return () => {
      alive = false
    }
  }, [owner, accessToken])

  const exhausted = remaining !== null && remaining <= 0
  const unavailable = !available
  const canAsk = owner !== null && !busy && !exhausted && !unavailable

  async function ask(text: string) {
    const question = text.trim()
    if (owner === null || question === '' || !canAsk) return
    setDraft('')
    const id = addTurn(owner, day, question)
    try {
      const token = await accessToken()
      if (!token) throw new AskError('서버에 연결하지 못했어요. 잠시 뒤에 다시 물어 주세요.', null)
      const reply = await postQuestion(token, question.slice(0, 300), chapterNumber, bundle.bookId)
      settleTurn(owner, day, id, { reply })
      setRemaining(reply.remaining)
      setUsageError(null)
    } catch (error) {
      settleTurn(owner, day, id, { error: error instanceof AskError ? error.message : '답을 만들지 못했어요.' })
      if (error instanceof AskError) {
        if (error.remaining !== null) setRemaining(error.remaining)
        if (error.status === 503) setAvailable(false)
      }
    }
  }

  function openCitation(turnId: number, citation: AskCitation) {
    if (citation.kind === 'canon') {
      const key = `${turnId}:${citation.id}`
      setOpenCanon((current) => (current === key ? null : key))
      return
    }
    // 다른 책의 대목으로는 가지 않는다. 그런 표식은 눌리지 않고 이름표 글로만 보인다.
    if (citation.book !== bundle.bookId) return
    if (citation.chapter === null || citation.verse === null) return
    goToReader(router, from, {
      position: { chapter: citation.chapter, verse: citation.verse },
      // 해설 근거는 그 장면의 해설 시트를 연다.
      overlay: citation.kind === 'scene' ? 'background' : undefined,
    })
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: palette.paper }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton name="back" label="뒤로" color={palette.ink} onPress={() => goBack(router)} />
        <Text style={[styles.heading, { color: palette.ink }]} accessibilityRole="header">
          질문하기
        </Text>
        <Text style={[styles.reading, { color: palette.inkSoft }]}>
          {bundle.book} {chapterNumber}장 읽는 중
        </Text>
      </View>

      {state.status === 'loading' ? (
        <ActivityIndicator style={styles.loading} color={palette.accent} />
      ) : owner === null ? (
        <SignedOut message={state.status === 'signedOut' ? state.message : null} onSignIn={() => void signIn()} />
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.thread}
            contentContainerStyle={styles.threadContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {turns.length === 0 && (
              <Text style={[styles.empty, { color: palette.inkSoft }]}>
                이 장을 읽다 궁금한 것을 물어보세요. 앱에 든 본문과 검수된 해설·설정집에서 찾아 답해요.
              </Text>
            )}
            {turns.map((turn) => (
              <TurnView
                key={turn.id}
                bundle={bundle}
                turn={turn}
                openCanon={openCanon}
                onCitation={(citation) => openCitation(turn.id, citation)}
              />
            ))}
          </ScrollView>

          <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
            {suggestions.length > 0 && (
              <View style={styles.suggestions}>
                {suggestions.map((question) => (
                  <Pressable
                    key={question}
                    accessibilityRole="button"
                    accessibilityLabel={`제안 질문: ${question}`}
                    accessibilityState={{ disabled: !canAsk }}
                    disabled={!canAsk}
                    onPress={() => void ask(question)}
                    style={({ pressed }) => [
                      styles.suggestion,
                      { borderColor: palette.line, backgroundColor: palette.surface, opacity: !canAsk ? 0.5 : pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.suggestionText, { color: palette.accent }]}>{question}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="질문"
                placeholder={exhausted ? '오늘 질문을 모두 썼어요' : '이 장에 대해 물어보세요'}
                placeholderTextColor={palette.inkFaint}
                value={draft}
                onChangeText={setDraft}
                editable={!exhausted && !unavailable}
                maxLength={300}
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={() => void ask(draft)}
                style={[styles.input, { borderColor: palette.line, backgroundColor: palette.surface, color: palette.ink }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="보내기"
                accessibilityState={{ disabled: !canAsk || draft.trim() === '' }}
                disabled={!canAsk || draft.trim() === ''}
                onPress={() => void ask(draft)}
                style={({ pressed }) => [
                  styles.send,
                  { backgroundColor: palette.accent, opacity: !canAsk || draft.trim() === '' ? 0.4 : pressed ? 0.8 : 1 },
                ]}
              >
                <Icon name="arrowUp" size={18} color={palette.paper} />
              </Pressable>
            </View>
            <Text style={[styles.usage, { color: usageError ? palette.warn : palette.inkSoft }]}>
              {usageText(available, remaining, usageError)}
            </Text>
            <Text style={[styles.footnote, { color: palette.inkFaint }]}>{FOOTNOTE}</Text>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

function usageText(available: boolean, remaining: number | null, error: string | null): string {
  if (!available) return '질문하기를 지금 쓸 수 없어요.'
  if (error) return error
  if (remaining === null) return ' '
  return remaining > 0 ? `오늘 남은 질문 ${remaining}번` : '오늘 질문을 모두 썼어요. 내일 다시 물어 주세요.'
}

function SignedOut({ message, onSignIn }: { message: string | null; onSignIn: () => void }) {
  const { palette } = useSettings()
  return (
    <View style={styles.signedOut}>
      <View style={[styles.card, { backgroundColor: palette.surface }]}>
        <Text style={[styles.cardTitle, { color: palette.ink }]}>로그인하면 물어볼 수 있어요</Text>
        <Text style={[styles.cardBody, { color: palette.inkSoft }]}>
          답은 서버가 앱의 본문과 검수된 해설·설정집에서 대목을 찾아 만들어요. 계정마다 하루 20번까지 물을 수 있고, 물은 내용은
          저장하지 않아요.
        </Text>
        {message ? <Text style={[styles.cardBody, { color: palette.warn }]}>{message}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={onSignIn}
          style={({ pressed }) => [styles.signIn, { backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.signInText, { color: palette.paper }]}>로그인</Text>
        </Pressable>
      </View>
    </View>
  )
}

function TurnView({
  bundle,
  turn,
  openCanon,
  onCitation,
}: {
  bundle: Bundle
  turn: Turn
  openCanon: string | null
  onCitation: (citation: AskCitation) => void
}) {
  const { palette } = useSettings()
  return (
    <View style={styles.turn}>
      <View style={[styles.mine, { backgroundColor: palette.accent }]}>
        <Text style={[styles.mineText, { color: palette.paper }]}>{turn.question}</Text>
      </View>
      {turn.reply !== null ? (
        <Reply bundle={bundle} turnId={turn.id} reply={turn.reply} openCanon={openCanon} onCitation={onCitation} />
      ) : (
        <View style={[styles.theirs, styles.waiting, { backgroundColor: palette.surface }]} accessibilityLiveRegion="polite">
          {turn.error !== null ? (
            <Text style={[styles.replyText, { color: palette.warn }]}>{turn.error}</Text>
          ) : (
            <>
              <ActivityIndicator size="small" color={palette.accent} />
              <Text style={[styles.replyText, { color: palette.inkSoft }]}>자료에서 찾는 중…</Text>
            </>
          )}
        </View>
      )}
    </View>
  )
}

function Reply({
  bundle,
  turnId,
  reply,
  openCanon,
  onCitation,
}: {
  bundle: Bundle
  turnId: number
  reply: AskReply
  openCanon: string | null
  onCitation: (citation: AskCitation) => void
}) {
  const { palette } = useSettings()
  const none = reply.status === 'none'
  const opened = reply.citations.find((citation) => `${turnId}:${citation.id}` === openCanon)
  // 딱지가 이미 "자료에 없어요"라서 글머리의 같은 말은 뺀다.
  const text = none ? reply.text.replace(/^자료에 없어요\.\s*/, '') : reply.text
  // 눌러서 열 수 있는 근거가 하나도 없으면 "눌러서 직접 읽어 보세요"라고 하지 않는다.
  const openable = reply.citations.some((citation) => opensHere(citation, bundle.bookId))
  return (
    <View
      style={[
        styles.theirs,
        { backgroundColor: palette.surface },
        none && { borderWidth: 1, borderStyle: 'dashed', borderColor: palette.inkFaint },
      ]}
      accessibilityLiveRegion="polite"
    >
      {none && <Text style={[styles.badge, { backgroundColor: palette.warnSoft, color: palette.warn }]}>자료에 없어요</Text>}
      <Text style={[styles.replyText, { color: palette.ink }]}>{text}</Text>
      {reply.citations.length > 0 && (
        <>
          {none && openable && <Text style={[styles.related, { color: palette.inkSoft }]}>가까운 대목이에요. 눌러서 직접 읽어 보세요.</Text>}
          <View style={styles.citations}>
            {reply.citations.map((citation) => {
              // 다른 책의 본문·해설은 읽기 화면으로 갈 수 없어서 누르는 표식이 아니라 글로만 보인다. 책 이름은 서버가 이름표에 붙여 준다.
              if (!opensHere(citation, bundle.bookId)) {
                return (
                  <View key={citation.id} style={[styles.citation, { backgroundColor: palette.line }]}>
                    <Text style={[styles.citationText, { color: palette.inkSoft }]}>{citation.label}</Text>
                  </View>
                )
              }
              const canon = citation.kind === 'canon'
              const expanded = `${turnId}:${citation.id}` === openCanon
              return (
                <Pressable
                  key={citation.id}
                  accessibilityRole={canon ? 'button' : 'link'}
                  accessibilityState={canon ? { expanded } : undefined}
                  accessibilityHint={canon ? '설정집 설명을 펼쳐요' : '읽기 화면의 그 자리로 가요'}
                  onPress={() => onCitation(citation)}
                  style={({ pressed }) => [
                    styles.citation,
                    { backgroundColor: canon ? palette.okSoft : palette.accentSoft, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.citationText, { color: canon ? palette.ok : palette.accent }]}>
                    {citation.label}
                    {canon ? (expanded ? ' ▴' : ' ▾') : ''}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </>
      )}
      {opened?.entity && <CanonNote bundle={bundle} entity={opened.entity} label={opened.label} />}
    </View>
  )
}

function CanonNote({ bundle, entity, label }: { bundle: Bundle; entity: NonNullable<AskCitation['entity']>; label: string }) {
  const { palette } = useSettings()
  const body =
    entity.kind === 'character'
      ? bundle.characters.find((item) => item.id === entity.id)?.notes
      : entity.kind === 'place'
        ? bundle.places.find((item) => item.id === entity.id)?.description
        : bundle.things.find((item) => item.id === entity.id)?.description
  const parts = paragraphs(body ?? '')
  // 이 묶음에서 항목을 찾지 못하면(body가 undefined, 다른 책에서 처음 나온 것) 설명 없이 이름표만 보인다.
  const empty = body === undefined ? label : '설정집에 설명이 아직 없어요.'
  return (
    <View style={[styles.canon, { backgroundColor: palette.paper }]}>
      {parts.length > 0 ? (
        parts.map((part, index) => (
          <Text key={index} style={[styles.canonText, { color: palette.ink }]}>
            {part}
          </Text>
        ))
      ) : (
        <Text style={[styles.canonText, { color: palette.inkSoft }]}>{empty}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, paddingRight: 20, paddingBottom: 6 },
  heading: { flex: 1, fontFamily: fonts.serifBold, fontSize: 22 },
  reading: { fontSize: 12 },
  loading: { marginTop: 40 },
  thread: { flex: 1 },
  threadContent: { gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  empty: { fontSize: 14, lineHeight: 22, paddingVertical: 12 },
  turn: { gap: 12 },
  mine: { alignSelf: 'flex-end', maxWidth: '80%', paddingVertical: 10, paddingHorizontal: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  mineText: { fontSize: 15, lineHeight: 22 },
  theirs: { alignSelf: 'flex-start', maxWidth: '92%', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomRightRadius: 16, borderBottomLeftRadius: 4 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyText: { fontSize: 15, lineHeight: 24 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', fontSize: 11, fontWeight: '700' },
  related: { fontSize: 12 },
  citations: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  citation: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  citationText: { fontSize: 12 },
  canon: { gap: 6, padding: 10, borderRadius: 10 },
  canonText: { fontSize: 13, lineHeight: 20 },
  composer: { gap: 8, paddingHorizontal: 20, paddingTop: 8 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestion: { justifyContent: 'center', height: 32, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  suggestionText: { fontSize: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, height: 46, paddingHorizontal: 16, borderWidth: 1, borderRadius: 23, fontSize: 15 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  usage: { fontSize: 12, textAlign: 'right' },
  footnote: { fontSize: 11, lineHeight: 17, textAlign: 'center' },
  signedOut: { padding: 20 },
  card: { gap: 12, padding: 18, borderRadius: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 14, lineHeight: 22 },
  signIn: { alignSelf: 'flex-start', height: 44, paddingHorizontal: 20, borderRadius: 12, justifyContent: 'center' },
  signInText: { fontSize: 15, fontWeight: '600' },
})
