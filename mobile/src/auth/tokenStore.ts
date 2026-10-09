import * as SecureStore from 'expo-secure-store'

// 갱신 토큰은 기기의 보안 저장소(키체인, 키스토어)에 둔다. 액세스 토큰은 메모리에만 둔다.
const key = 'auth-refresh-token'

export const tokenStore = {
  load: (): Promise<string | null> => SecureStore.getItemAsync(key),
  save: (token: string): Promise<void> => SecureStore.setItemAsync(key, token),
  clear: (): Promise<void> => SecureStore.deleteItemAsync(key),
}
