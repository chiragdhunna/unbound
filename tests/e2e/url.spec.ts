import { expect, test } from '@playwright/test'

test.describe('URL conversion and CORS guidance', () => {
  test('fetches a same-origin web page URL and converts it to markdown with relative links resolved', async ({
    page,
    baseURL
  }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin
    const targetUrl = `${origin}/fixtures/remote-article.html`

    const mockHtml = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Remote Unbound Article</title>
        </head>
        <body>
          <nav><a href="/home">Home</a></nav>
          <article>
            <h1>Remote Unbound Article</h1>
            <p class="byline">By Unbound Test Author</p>
            <p>This is a fetched web page test with a <a href="/docs/guide">relative guide link</a>.</p>
          </article>
          <footer>Unused footer content</footer>
        </body>
      </html>
    `

    await page.route(targetUrl, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: mockHtml
      })
    })

    await page.goto('/')

    // Click "Fetch URL" button in DropZone to show input
    const fetchUrlButton = page.getByRole('button', { name: 'Fetch URL', exact: true })
    await expect(fetchUrlButton).toBeVisible()
    await fetchUrlButton.click()

    // Fill in URL input and submit
    const urlInput = page.getByLabel('Enter web page URL')
    await expect(urlInput).toBeVisible()
    await urlInput.fill(targetUrl)

    const submitButton = page.getByRole('button', { name: 'Fetch', exact: true })
    await submitButton.click()

    // Verify converted output
    const output = page.getByRole('textbox', { name: 'Converted output' })
    await expect(output).toContainText('Remote Unbound Article', { timeout: 30_000 })
    await expect(output).toContainText('relative guide link', { timeout: 30_000 })

    const text = await output.inputValue()
    expect(text).toContain('By Unbound Test Author')
    expect(text).toContain(`[relative guide link](${origin}/docs/guide)`)
    expect(text).not.toContain('Unused footer content')
  })

  test('shows actionable CORS guidance when URL fetch fails due to cross-origin restriction', async ({
    page
  }) => {
    await page.goto('/')

    const fetchUrlButton = page.getByRole('button', { name: 'Fetch URL', exact: true })
    await fetchUrlButton.click()

    const urlInput = page.getByLabel('Enter web page URL')
    await urlInput.fill('https://cors-blocked.example.com/blocked-page')

    const submitButton = page.getByRole('button', { name: 'Fetch', exact: true })
    await submitButton.click()

    // Assert that the job error message contains the actionable CORS message
    const errorMessage = page.locator('.job-error')
    await expect(errorMessage).toBeVisible({ timeout: 10_000 })
    await expect(errorMessage).toContainText(
      'Unable to fetch URL directly due to browser cross-origin restrictions (CORS)'
    )
    await expect(errorMessage).toContainText(
      'save it as an HTML file (.html) or copy-paste its content directly'
    )

    // Verify Retry button is available for failed URL job
    const retryButton = page.getByRole('button', { name: 'Retry' })
    await expect(retryButton).toBeVisible()
  })
})
