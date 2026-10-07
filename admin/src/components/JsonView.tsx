// 모양을 정할 수 없는 값(제안의 value 등)을 그대로 보여 준다.
export default function JsonView({ value, label }: { value: unknown; label?: string }) {
  const text = typeof value === 'string' ? value : value === undefined ? '(없음)' : JSON.stringify(value, null, 2)
  return (
    <pre className="json-view" aria-label={label}>
      {text}
    </pre>
  )
}
