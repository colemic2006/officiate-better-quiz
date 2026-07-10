import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Project Pages default. If a custom domain (CNAME) is added later, change this to '/'.
  base: '/officiate-better-quiz/',
})
