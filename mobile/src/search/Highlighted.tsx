import { Text, type StyleProp, type TextStyle } from 'react-native'
import type { TextRange } from 'reader-core'

// 찾은 자리를 칠한 글. range가 없으면 그냥 글이다.
export function Highlighted({
  text,
  range,
  style,
  highlight,
  numberOfLines,
}: {
  text: string
  range: TextRange | null
  style?: StyleProp<TextStyle>
  highlight: TextStyle
  numberOfLines?: number
}) {
  if (!range) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    )
  }
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {text.slice(0, range.start)}
      <Text style={highlight}>{text.slice(range.start, range.end)}</Text>
      {text.slice(range.end)}
    </Text>
  )
}
