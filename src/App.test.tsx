import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Battleship AI' })).toBeInTheDocument()
  })

  it('starts in the placement phase with the enemy board disabled', () => {
    render(<App />)
    expect(screen.getByText(/place your carrier/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enemy waters A1' })).toBeDisabled()
  })

  it('fires at the enemy board and lets the AI answer after a delay', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Random Fleet' }))

    expect(screen.getByText(/your turn/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enemy waters A1' }))

    const log = screen.getByRole('region', { name: 'Shot log' })
    expect(within(log).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText(/AI's turn/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enemy waters B1' })).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(within(log).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(/your turn/i)).toBeInTheDocument()
  })

  it('previews on the first tap and places on the second on a touch device', () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', matchMedia)

    render(<App />)
    const target = () => screen.getByRole('button', { name: 'Your fleet A1' })

    fireEvent.click(target())
    expect(screen.getByText(/place your carrier/i)).toBeInTheDocument()
    expect(target()).toHaveAttribute('data-kind', 'water')
    expect(target().className).toContain('ring-emerald-300')

    fireEvent.click(target())
    expect(target()).toHaveAttribute('data-kind', 'ship')
    expect(screen.getByText(/place your battleship/i)).toBeInTheDocument()

    const offBoard = () => screen.getByRole('button', { name: 'Your fleet H2' })
    fireEvent.click(offBoard())
    fireEvent.click(offBoard())
    expect(offBoard()).toHaveAttribute('data-kind', 'water')
    expect(offBoard().className).toContain('ring-rose-400')

    vi.unstubAllGlobals()
  })

  it('places a ship on the player board by clicking a cell', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Your fleet A1' }))
    expect(screen.getByText(/place your battleship/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Your fleet A1' })).toHaveAttribute(
      'data-kind',
      'ship',
    )
  })
})
