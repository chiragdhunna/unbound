import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../src/App'

describe('App shell', () => {
  it('renders the unbound shell headline', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'unbound_' })).toBeInTheDocument()
  })

  it('displays the English-only OCR language notice in the UI', () => {
    render(<App />)

    expect(
      screen.getByText(
        'English-first in v1; other languages are not supported yet.'
      )
    ).toBeInTheDocument()
  })

  it('converts a text file and displays output', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('Choose file')
    const file = new File(['hello world'], 'hello.txt', { type: 'text/plain' })

    await user.upload(input, file)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('hello world\n')
    })
  })
})
