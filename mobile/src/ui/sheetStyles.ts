import { StyleSheet } from 'react-native'
import { fonts } from '../theme/palette'

// 시트 안 글 모양(웹 목업의 .sheet h3, .term, .explanation, .chip). 색은 쓰는 곳에서 더한다.
export const sheetStyles = StyleSheet.create({
  h3: { marginTop: 6, fontSize: 14, fontWeight: '700' },
  term: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, fontSize: 14, lineHeight: 21, overflow: 'hidden' },
  termVerse: { fontSize: 12 },
  explanation: { gap: 10 },
  paragraph: { fontSize: 15, lineHeight: 25.5 },
  serifParagraph: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 25.5 },
  empty: { fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderRadius: 999, fontSize: 12, overflow: 'hidden' },
  note: { fontSize: 12, lineHeight: 19 },
})
