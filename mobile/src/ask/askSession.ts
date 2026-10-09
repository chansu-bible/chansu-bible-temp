import { useSyncExternalStore } from 'react'
import type { AskReply } from './askApi'

// 물은 것 하나: 답을 기다리는 동안은 reply와 error가 모두 null이다.
export type Turn = { id: number; question: string; reply: AskReply | null; error: string | null }

// 오늘 이 계정으로 물은 것. 메모리에만 두어 앱을 끄면 사라진다(질문은 기기에도 서버에도 남기지 않는다).
// 근거 표식을 눌러 읽기 화면에 다녀와도 대화가 남도록 화면 밖에 둔다.
type Session = { owner: string; day: string; turns: Turn[] }

let session: Session | null = null
let nextId = 1
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): Session | null {
  return session
}

const empty: Turn[] = []

export function useAskTurns(owner: string | null, day: string): Turn[] {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)
  return owner !== null && current !== null && current.owner === owner && current.day === day ? current.turns : empty
}

function update(owner: string, day: string, change: (turns: Turn[]) => Turn[]): void {
  const base = session !== null && session.owner === owner && session.day === day ? session.turns : []
  session = { owner, day, turns: change(base) }
  for (const listener of listeners) listener()
}

export function addTurn(owner: string, day: string, question: string): number {
  const id = nextId++
  update(owner, day, (turns) => [...turns, { id, question, reply: null, error: null }])
  return id
}

export function settleTurn(owner: string, day: string, id: number, result: { reply: AskReply } | { error: string }): void {
  update(owner, day, (turns) => turns.map((turn) => (turn.id === id ? { ...turn, ...result } : turn)))
}
