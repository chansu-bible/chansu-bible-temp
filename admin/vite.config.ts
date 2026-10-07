import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 관리 화면. API는 관리 서버(127.0.0.1:8787)로 넘긴다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
})
