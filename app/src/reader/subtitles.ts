const key = 'reader-subtitles'

// 자막은 처음에 켜져 있다. 끈 경우에만 기억한다.
export function loadSubtitles(): boolean {
  try {
    return localStorage.getItem(key) !== 'off'
  } catch {
    return true
  }
}

export function saveSubtitles(on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off')
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 자막 설정 저장을 건너뛴다.
  }
}
