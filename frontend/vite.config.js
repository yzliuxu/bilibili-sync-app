import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 引入 Tailwind 插件
import { createHtmlPlugin } from 'vite-plugin-html'
import APP_CONFIG from './src/config'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), 
    createHtmlPlugin({
      inject: {
        data: {
          title: APP_CONFIG.TITLE,
        },
      },
    }),
  ],
})