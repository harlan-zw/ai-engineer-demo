import { githubClient } from './github.ts'
import { github, issueView, parseSubmission, positiveNumber, repo } from './submissions.ts'

const maxBodyBytes = 4096

function json(data: unknown, status = 200, cache = 'no-store') {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
    },
  })
}

async function readBody(request: Request): Promise<{ _tag: 'Ok', text: string } | { _tag: 'TooLarge' }> {
  const reader = request.body?.getReader()
  if (!reader)
    return { _tag: 'Ok', text: '' }
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  for (;;) {
    const part = await reader.read()
    if (part.done)
      return { _tag: 'Ok', text: text + decoder.decode() }
    bytes += part.value.byteLength
    if (bytes > maxBodyBytes) {
      await reader.cancel()
      return { _tag: 'TooLarge' }
    }
    text += decoder.decode(part.value, { stream: true })
  }
}

async function submit(request: Request, env: Env, client: ReturnType<typeof githubClient>) {
  if (!env.GITHUB_TOKEN)
    return json({ message: 'Feedback is temporarily unavailable. Try again later.' }, 503)
  const origin = new URL(request.url).origin
  if (request.headers.get('origin') !== origin)
    return json({ message: 'Open the demo site to submit a suggestion.' }, 403)
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return json({ message: 'Send JSON to submit a suggestion.' }, 415)
  const limit = await env.SUBMISSIONS.limit({ key: request.headers.get('cf-connecting-ip') ?? 'local' })
  if (!limit.success)
    return json({ message: 'The form is busy. Try again in a minute.' }, 429)
  const body = await readBody(request)
  if (body._tag === 'TooLarge')
    return json({ message: 'This suggestion is too large.' }, 413)
  let input: unknown
  try {
    input = JSON.parse(body.text)
  }
  catch {
    return json({ message: 'Send valid JSON.' }, 400)
  }
  const submission = parseSubmission(input)
  if (submission._tag === 'Err')
    return json({ message: submission.message }, 400)
  if (submission._tag === 'Ignored')
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  const result = await client.file(submission)
  if (result._tag === 'Err') {
    console.warn('github_issue_create_failed', { status: result.status })
    return json({ message: 'GitHub could not create your issue. Your suggestion is still in the form.' }, 502)
  }
  return json({ number: result.value, url: `${github}/issues/${result.value}` }, 201)
}

async function board(url: URL, client: ReturnType<typeof githubClient>, ctx: ExecutionContext) {
  const rawNumber = url.searchParams.get('issue')
  const number = rawNumber === null ? undefined : Number(rawNumber)
  if (number !== undefined && !positiveNumber(number))
    return json({ message: 'Enter a valid issue number.' }, 400)

  const cacheUrl = new URL(url.pathname, url.origin)
  if (number !== undefined)
    cacheUrl.searchParams.set('issue', String(number))
  const cacheKey = new Request(cacheUrl)
  const cache = caches.default
  const cached = await cache.match(cacheKey)
  if (cached)
    return cached

  const result = number === undefined ? await client.recent() : await client.issue(number)
  if (result._tag === 'Err') {
    if (result.status === 404 && number !== undefined)
      return json({ message: 'That number is not an audience submission.' }, 404)
    console.warn('github_board_read_failed', { status: result.status })
    return json({ message: 'GitHub updates are temporarily unavailable. Try refreshing.' }, 503)
  }
  const data = Array.isArray(result.value)
    ? { issues: result.value.map(issue => ({ number: issue.number, status: issueView(issue).status })) }
    : { issue: issueView(result.value) }
  const response = json({ ...data, checkedAt: new Date().toISOString() }, 200, 'public, max-age=6')
  ctx.waitUntil(cache.put(cacheKey, response.clone()).catch((error: unknown) => {
    console.warn('board_cache_write_failed', { error: error instanceof Error ? error.name : 'Unknown' })
  }))
  return response
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/'))
      return env.ASSETS.fetch(request)
    const client = githubClient(globalThis.fetch, env.GITHUB_TOKEN)
    try {
      if (url.pathname === '/api/feedback/health' && request.method === 'GET')
        return json({ ok: true, repo, configured: Boolean(env.GITHUB_TOKEN) })
      if (url.pathname === '/api/feedback' && request.method === 'POST')
        return await submit(request, env, client)
      if (url.pathname === '/api/board' && request.method === 'GET')
        return await board(url, client, ctx)
      return json({ message: 'This endpoint does not exist.' }, 404)
    }
    catch (error) {
      console.error('demo_request_failed', { route: url.pathname, error: error instanceof Error ? error.name : 'Unknown' })
      return json({ message: 'The demo could not handle this request. Try again.' }, 502)
    }
  },
} satisfies ExportedHandler<Env>
