export const repo = 'harlan-zw/ai-engineer-demo'
export const audienceLabel = 'audience-feedback'
export const github = `https://github.com/${repo}`

const regions = {
  whole: 'The whole page',
  intro: 'Talk and event details',
  form: 'Feedback form',
} as const

export type Submission =
  | { _tag: 'Ok', text: string, region: (typeof regions)[keyof typeof regions] }
  | { _tag: 'Ignored' }
  | { _tag: 'Err', message: string }

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function parseSubmission(input: unknown): Submission {
  const value = record(input)
  if (!value)
    return { _tag: 'Err', message: 'Send a JSON object.' }
  if (typeof value.website === 'string' && value.website)
    return { _tag: 'Ignored' }
  const text = typeof value.feedback === 'string' ? value.feedback.trim() : ''
  if (text.length < 10 || text.length > 600)
    return { _tag: 'Err', message: 'Write between 10 and 600 characters.' }
  const region = value.region
  if (region !== 'whole' && region !== 'intro' && region !== 'form')
    return { _tag: 'Err', message: 'Choose which part of the page to change.' }
  return { _tag: 'Ok', text, region: regions[region] }
}

export function toIssue(submission: Extract<Submission, { _tag: 'Ok' }>) {
  const firstLine = submission.text.split(/\r?\n/u, 1)[0].replaceAll('@', '＠')
  const title = [...firstLine].slice(0, 90).join('')
  const quotedText = submission.text.split(/\r?\n/u).map(line => `    ${line}`).join('\n')
  return {
    title,
    body: `Audience submission from the AI Engineer Sydney demo.\n\n**Page area:** ${submission.region}\n\n${quotedText}`,
    labels: [audienceLabel],
  }
}

export interface PullRequest {
  number: number
  state: 'OPEN' | 'CLOSED' | 'MERGED'
}

export interface Issue {
  number: number
  title: string
  closed: boolean
  labels: string[]
  pullRequests: PullRequest[]
}

export function issueStatus(issue: Issue) {
  if (issue.pullRequests.some(pull => pull.state === 'MERGED'))
    return 'Merged'
  if (issue.pullRequests.some(pull => pull.state === 'OPEN'))
    return 'PR open'
  if (issue.closed)
    return 'Closed'
  if (issue.labels.some(label => label === 'harlan-agent-blocked' || label === 'harlan-agent-wait-to-implement' || label === 'harlan-agent-needs-info'))
    return 'Blocked'
  if (issue.labels.includes('harlan-agent-running'))
    return 'Running'
  if (issue.labels.some(label => label === 'harlan-agent-ready-to-implement' || label === 'harlan-agent-ready-to-spec' || label === 'harlan-agent-pending'))
    return 'Queued'
  return 'Submitted'
}

export function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function issueView(issue: Issue) {
  return {
    number: issue.number,
    title: issue.title,
    status: issueStatus(issue),
    url: `${github}/issues/${issue.number}`,
    pullRequests: issue.pullRequests.map(pull => ({
      ...pull,
      url: `${github}/pull/${pull.number}`,
    })),
  }
}
