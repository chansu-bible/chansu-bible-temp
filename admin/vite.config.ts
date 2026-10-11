import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 관리 화면. API는 관리 서버(127.0.0.1:8787)로 넘긴다.
export default defineConfig({
  plugins: [react()],
  server: {
    // 이 컴퓨터에서만 연다. localhost로 두면 macOS에서 IPv6(::1)에만 묶여 SSH 포트 전달(127.0.0.1)이 닿지 않을 수 있다.
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
