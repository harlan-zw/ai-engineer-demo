import { bindings, defineConfig } from 'cf/config'
import * as entrypoint from './src/worker.ts' with { type: 'cf-worker' }

export default defineConfig({
  worker: {
    name: 'ai-engineer-demo',
    compatibilityDate: '2026-11-19',
    entrypoint,
    domains: ['ai-engineer.harlanzw.com'],
    workersDev: false,
    previewUrls: false,
    assets: { runWorkerFirst: ['/api/*'] },
    observability: { enabled: true },
    env: {
      ASSETS: bindings.assets(),
      GITHUB_TOKEN: bindings.secret(),
      SUBMISSIONS: bindings.rateLimit({ namespace: '41762001', simple: { limit: 45, period: 60 } }),
    },
  },
})
