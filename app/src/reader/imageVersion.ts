import type { Bundle, ImageVersion } from '../content/types.ts'

const key = 'reader-image-version'

// 저장해 둔 버전이 묶음에 아직 있으면 그 버전을, 아니면 기본 버전을 고른다.
export function pickImageVersion(
  bundle: Pick<Bundle, 'imageVersions' | 'defaultImageVersion'>,
  saved: string | null,
): string | null {
  return bundle.imageVersions.some((version) => version.id === saved) ? saved : bundle.defaultImageVersion
}

// 버튼을 누를 때마다 다음 버전으로 넘어가고, 마지막 다음은 처음이다.
export function nextImageVersion(versions: ImageVersion[], current: string | null): string | null {
  if (versions.length === 0) return null
  const index = versions.findIndex((version) => version.id === current)
  return versions[(index + 1) % versions.length].id
}

export function loadImageVersion(): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function saveImageVersion(id: string): void {
  try {
    localStorage.setItem(key, id)
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 선택을 저장하지 않는다.
  }
}
