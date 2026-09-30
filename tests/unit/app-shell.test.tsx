import { render, screen } from '@testing-library/react'
import App from '../../src/App'

describe('App shell', () => {
  it('renders the unbound shell headline', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'unbound_' })).toBeInTheDocument()
  })
})
