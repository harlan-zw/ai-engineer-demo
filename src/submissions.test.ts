import assert from 'node:assert/strict'
import test from 'node:test'
import { githubClient } from './github.ts'
import { issueStatus, parseSubmission, toIssue } from './submissions.ts'

test('feedback becomes one labelled issue with a fixed page context', () => {
  const submission = parseSubmission({ feedback: '  Make the footer link easier for @team to see. ', region: 'whole' })
  assert.equal(submission._tag, 'Ok')
  if (submission._tag !== 'Ok')
    return
  const issue = toIssue(submission)
  assert.deepEqual(issue.labels, ['audience-feedback'])
  assert.match(issue.title, /＠team/u)
  assert.match(issue.body, / {4}Make the footer link easier for @team to see\./u)
})

test('bad lengths, unrecognised page areas and honeypots do not become issues', () => {
  assert.equal(parseSubmission({ feedback: 'x', region: 'whole' })._tag, 'Err')
  assert.equal(parseSubmission({ feedback: 'x'.repeat(601), region: 'whole' })._tag, 'Err')
  assert.equal(parseSubmission({ feedback: 'Use a bigger heading.', region: 'admin' })._tag, 'Err')
  assert.equal(parseSubmission({ website: 'bot', feedback: 'Use a bigger heading.', region: 'intro' })._tag, 'Ignored')
})

test('the issue and PR evidence decide the visible state', () => {
  const issue = { number: 9, title: 'Use a bigger heading.', closed: false, labels: ['audience-feedback'], pullRequests: [] }
  assert.equal(issueStatus(issue), 'Submitted')
  assert.equal(issueStatus({ ...issue, labels: ['harlan-agent-ready-to-implement'] }), 'Queued')
  assert.equal(issueStatus({ ...issue, labels: ['harlan-agent-running'] }), 'Running')
  assert.equal(issueStatus({ ...issue, labels: ['harlan-agent-wait-to-implement'] }), 'Blocked')
  assert.equal(issueStatus({ ...issue, pullRequests: [{ number: 10, state: 'OPEN' }] }), 'PR open')
  assert.equal(issueStatus({ ...issue, closed: true, pullRequests: [{ number: 10, state: 'MERGED' }] }), 'Merged')
  assert.equal(issueStatus({ ...issue, closed: true }), 'Closed')
})

test('the board follows linked PRs in the Sydney repository only', async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://api.github.com/graphql')
    assert.deepEqual(JSON.parse(String(init?.body)).variables, { number: 9 })
    return Response.json({ data: { repository: { issue: {
      number: 9, title: 'Use a bigger heading.', state: 'OPEN',
      labels: { nodes: [{ name: 'audience-feedback' }] },
      closedByPullRequestsReferences: { nodes: [
        { number: 10, state: 'OPEN', repository: { nameWithOwner: 'harlan-zw/ai-engineer-demo' } },
        { number: 11, state: 'MERGED', repository: { nameWithOwner: 'someone/else' } },
      ] },
    } } } })
  }
  const result = await githubClient(fetcher, 'fixture').issue(9)
  assert.equal(result._tag, 'Ok')
  if (result._tag === 'Ok')
    assert.deepEqual(result.value.pullRequests, [{ number: 10, state: 'OPEN' }])
})

test('headings and selected issue IDs never treat arbitrary repo issues as feedback', async () => {
  const fetcher: typeof fetch = async () => Response.json({ data: { repository: { issue: {
    number: 9, title: 'Site setup.', state: 'OPEN', labels: { nodes: [] },
  } } } })
  assert.deepEqual(await githubClient(fetcher, 'fixture').issue(9), { _tag: 'Err', status: 404 })
})
