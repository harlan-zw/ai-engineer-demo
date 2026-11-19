import { positiveNumber, record } from '../src/submissions.ts'
import './site.css'

const form = document.querySelector<HTMLFormElement>('#feedback-form')!
const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!
const output = document.querySelector<HTMLElement>('#feedback-result')!

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (button.disabled)
    return
  const fields = new FormData(form)
  button.disabled = true
  output.textContent = 'Submitting…'
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        region: fields.get('region'),
        feedback: fields.get('feedback'),
        website: fields.get('website'),
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (response.status === 204) {
      output.textContent = 'This suggestion was not accepted.'
      return
    }
    const result = record(await response.json())
    if (!response.ok) {
      output.textContent = typeof result?.message === 'string' ? result.message : 'Try again in a moment.'
      return
    }
    if (!positiveNumber(result?.number)) {
      output.textContent = 'Check live submissions for your issue before trying again.'
      return
    }
    const link = document.createElement('a')
    link.href = `/board/?issue=${result.number}`
    link.textContent = `Follow issue #${result.number}`
    output.replaceChildren('Suggestion submitted. ', link)
    form.reset()
  }
  catch {
    output.textContent = 'The connection dropped. Check live submissions before trying again.'
  }
  finally {
    button.disabled = false
  }
})
