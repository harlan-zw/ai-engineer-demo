import type { Issue, PullRequest, Submission } from './submissions.ts'
import { audienceLabel, positiveNumber, record, repo, toIssue } from './submissions.ts'

type GitHubResult<T> = { _tag: 'Ok', value: T } | { _tag: 'Err', status: number }
type Fetch = typeof fetch

/* GitHub's GraphQL relationship includes references from open and merged PRs. */
const issueQuery = `
  query AudienceIssue($number: Int!) {
    repository(owner: "harlan-zw", name: "ai-engineer-demo") {
      issue(number: $number) {
        number
        title
        state
        labels(first: 40) { nodes { name } }
        closedByPullRequestsReferences(first: 12, includeClosedPrs: true) {
          nodes { number state repository { nameWithOwner } }
        }
      }
    }
  }
`

function nodes(value: unknown): unknown[] {
  const list = record(value)?.nodes
  return Array.isArray(list) ? list : []
}

function labelNames(items: unknown[]): string[] {
  return items.flatMap((item) => {
    const label = record(item)?.name
    return typeof label === 'string' ? [label] : []
  })
}

function pullRequests(items: unknown[]): PullRequest[] {
  const result: PullRequest[] = []
  for (const item of items) {
    const pull = record(item)
    if (record(pull?.repository)?.nameWithOwner !== repo || !positiveNumber(pull?.number))
      continue
    const state = pull.state
    if (state === 'OPEN' || state === 'CLOSED' || state === 'MERGED')
      result.push({ number: pull.number, state })
  }
  return result
}

export function githubClient(fetcher: Fetch, token?: string) {
  async function request(path: string, init?: RequestInit): Promise<GitHubResult<unknown>> {
    const headers = new Headers({
      accept: 'application/vnd.github+json',
      'user-agent': 'ai-engineer-demo',
      'x-github-api-version': '2022-11-28',
    })
    if (token)
      headers.set('authorization', `Bearer ${token}`)
    if (init?.body)
      headers.set('content-type', 'application/json')
    const response = await fetcher(`https://api.github.com${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok)
      return { _tag: 'Err', status: response.status }
    return { _tag: 'Ok', value: await response.json() }
  }

  return {
    async file(submission: Extract<Submission, { _tag: 'Ok' }>): Promise<GitHubResult<number>> {
      const result = await request(`/repos/${repo}/issues`, {
        method: 'POST',
        body: JSON.stringify(toIssue(submission)),
      })
      if (result._tag === 'Err')
        return result
      const number = record(result.value)?.number
      return positiveNumber(number) ? { _tag: 'Ok', value: number } : { _tag: 'Err', status: 502 }
    },

    async recent(): Promise<GitHubResult<Issue[]>> {
      const result = await request(`/repos/${repo}/issues?labels=${audienceLabel}&state=all&sort=created&direction=desc&per_page=8`)
      if (result._tag === 'Err')
        return result
      if (!Array.isArray(result.value))
        return { _tag: 'Err', status: 502 }
      const issues: Issue[] = []
      for (const item of result.value) {
        const issue = record(item)
        if (!issue || issue.pull_request || !positiveNumber(issue.number) || typeof issue.title !== 'string')
          continue
        const labels = labelNames(Array.isArray(issue.labels) ? issue.labels : [])
        if (labels.includes(audienceLabel))
          issues.push({ number: issue.number, title: issue.title, closed: issue.state === 'closed', labels, pullRequests: [] })
      }
      return { _tag: 'Ok', value: issues }
    },

    async issue(number: number): Promise<GitHubResult<Issue>> {
      if (!token)
        return { _tag: 'Err', status: 503 }
      const result = await request('/graphql', {
        method: 'POST',
        body: JSON.stringify({ query: issueQuery, variables: { number } }),
      })
      if (result._tag === 'Err')
        return result
      const response = record(result.value)
      if (Array.isArray(response?.errors) && response.errors.length) {
        const notFound = response.errors.every(error => record(error)?.type === 'NOT_FOUND')
        return { _tag: 'Err', status: notFound ? 404 : 502 }
      }
      const issue = record(record(record(response?.data)?.repository)?.issue)
      if (!issue)
        return { _tag: 'Err', status: 404 }
      const labels = labelNames(nodes(issue.labels))
      if (!labels.includes(audienceLabel) || issue.number !== number || typeof issue.title !== 'string')
        return { _tag: 'Err', status: 404 }
      return { _tag: 'Ok', value: { number, title: issue.title, closed: issue.state === 'CLOSED', labels, pullRequests: pullRequests(nodes(issue.closedByPullRequestsReferences)) } }
    },
  }
}
