import { github, positiveNumber, record } from '../src/submissions.ts'
import './site.css'

const form = document.querySelector<HTMLFormElement>('#find-issue')!
const input = document.querySelector<HTMLInputElement>('#number')!
const refresh = document.querySelector<HTMLButtonElement>('#refresh')!
const status = document.querySelector<HTMLElement>('#board-status')!
const list = document.querySelector<HTMLOListElement>('#issues')!
const detail = document.querySelector<HTMLElement>('#selected')!

const requested = Number(new URLSearchParams(location.search).get('issue'))
let selected = positiveNumber(requested) ? requested : undefined
let active: AbortController | undefined
let lastResult = ''
let showTitle = false

function link(url: string, title: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.textContent = title
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  return anchor
}

function follow(number: number) {
  selected = number
  input.value = String(number)
  showTitle = false
  lastResult = ''
  detail.hidden = true
  list.replaceChildren()
  status.textContent = `Loading issue #${number}…`
  active?.abort()
  active = undefined
  void update()
}

function showIssue(issue: Record<string, unknown>) {
  if (!positiveNumber(issue.number) || typeof issue.status !== 'string' || typeof issue.title !== 'string')
    return
  const heading = document.createElement('h2')
  heading.textContent = `#${issue.number} · ${issue.status}`
  const title = document.createElement('p')
  title.className = 'issue-title'
  title.textContent = issue.title
  title.hidden = !showTitle
  const toggle = document.createElement('button')
  const syncTitle = () => {
    title.hidden = !showTitle
    toggle.textContent = showTitle ? 'Hide suggestion' : 'Show suggestion'
    toggle.setAttribute('aria-expanded', String(showTitle))
  }
  toggle.type = 'button'
  syncTitle()
  toggle.addEventListener('click', () => {
    showTitle = !showTitle
    syncTitle()
  })
  const links = document.createElement('p')
  links.append(link(`${github}/issues/${issue.number}`, 'Open issue on GitHub'))
  if (Array.isArray(issue.pullRequests)) {
    for (const item of issue.pullRequests) {
      const pull = record(item)
      if (positiveNumber(pull?.number)) {
        const label = pull.state === 'MERGED' ? 'Merged PR' : 'PR'
        links.append(link(`${github}/pull/${pull.number}`, `${label} #${pull.number}`))
      }
    }
  }
  detail.replaceChildren(heading, links, toggle, title)
  detail.hidden = false
  list.replaceChildren()
}

function showRecent(issues: unknown[]) {
  const rows = []
  for (const item of issues) {
    const issue = record(item)
    if (!positiveNumber(issue?.number) || typeof issue.status !== 'string')
      continue
    const number = issue.number
    const row = document.createElement('li')
    row.className = 'issue-line'
    const followButton = document.createElement('button')
    followButton.type = 'button'
    followButton.textContent = `#${number}`
    followButton.setAttribute('aria-label', `Follow issue #${number}`)
    followButton.addEventListener('click', () => follow(number))
    const state = document.createElement('span')
    state.textContent = issue.status
    row.append(followButton, state)
    rows.push(row)
  }
  list.replaceChildren(...rows)
  detail.hidden = true
}

async function update() {
  if (active)
    return
  const request = new AbortController()
  active = request
  try {
    const endpoint = selected === undefined ? '/api/board' : `/api/board?issue=${selected}`
    const response = await fetch(endpoint, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(8500)]) })
    const result = record(await response.json())
    if (request.signal.aborted)
      return
    if (!response.ok || !result) {
      status.textContent = typeof result?.message === 'string' ? result.message : 'Could not load live submissions.'
      return
    }
    const issue = selected === undefined ? undefined : record(result.issue)
    const issues = selected === undefined && Array.isArray(result.issues) ? result.issues : undefined
    const signature = JSON.stringify(issue ?? issues)
    if (signature !== lastResult) {
      lastResult = signature
      if (issue)
        showIssue(issue)
      if (issues)
        showRecent(issues)
    }
    status.textContent = issues?.length === 0 ? 'Waiting for the first audience submission.' : ''
  }
  catch {
    if (!request.signal.aborted)
      status.textContent = 'Connection interrupted. Try refreshing.'
  }
  finally {
    if (active === request)
      active = undefined
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const number = input.valueAsNumber
  if (positiveNumber(number))
    follow(number)
})
refresh.addEventListener('click', () => void update())
if (selected !== undefined)
  input.value = String(selected)
status.textContent = 'Loading live submissions…'
void update()
window.setInterval(() => {
  if (document.visibilityState === 'visible')
    void update()
}, 8000)
