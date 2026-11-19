import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [cloudflare()],
  environments: {
    client: {
      build: {
        rolldownOptions: {
          input: { home: 'index.html', board: 'board/index.html' },
        },
      },
    },
  },
})
