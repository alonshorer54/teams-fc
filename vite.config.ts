import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ב-GitHub Pages האתר יושב תחת /teams-fc/, מקומית תחת השורש
const base = process.env.GITHUB_ACTIONS ? '/teams-fc/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
