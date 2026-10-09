// Expo 웹 미리 보기에서는 탭을 닫으면 사라지는 sessionStorage에 둔다.
const key = 'auth-refresh-token'

export const tokenStore = {
  load: async (): Promise<string | null> => sessionStorage.getItem(key),
  save: async (token: string): Promise<void> => sessionStorage.setItem(key, token),
  clear: async (): Promise<void> => sessionStorage.removeItem(key),
}
