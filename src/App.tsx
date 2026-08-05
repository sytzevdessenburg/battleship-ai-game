import { useEffect, useReducer, useState } from 'react'
import { FLEET, isSunk } from './engine'
import type { Board } from './engine'
import { createGameState, gameReducer, previewPlacement } from './game/state'
import { BoardGrid } from './ui/BoardGrid'
import { ShotLog } from './ui/ShotLog'
import { useCoarsePointer } from './ui/useCoarsePointer'

const AI_DELAY_MS = 500

function FleetStatus({ board, title }: { board: Board; title: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs tracking-[0.2em] text-sky-300/70 uppercase">{title}</span>
      {FLEET.map((spec) => {
        const ship = board.ships.find((entry) => entry.id === spec.id)
        const sunk = ship !== undefined && isSunk(ship)
        return (
          <span
            key={spec.id}
            className={`rounded-full px-2 py-0.5 text-xs capitalize ${
              sunk
                ? 'bg-rose-600/30 text-rose-200 line-through'
                : 'bg-sky-800/50 text-sky-100'
            }`}
          >
            {spec.id} {spec.length}
          </span>
        )
      })}
    </div>
  )
}

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createGameState)
  const [hovered, setHovered] = useState<number | null>(null)
  /** Origin picked by a first tap on a touch device, confirmed by a second tap. */
  const [selected, setSelected] = useState<number | null>(null)
  const touch = useCoarsePointer()

  const placingShip = FLEET[state.placingIndex]
  const origin = touch ? selected : hovered
  const preview =
    state.phase === 'placement' && origin !== null && placingShip
      ? previewPlacement(state.playerBoard, origin, placingShip.length, state.orientation)
      : null

  const placeAt = (index: number) => {
    if (touch && selected !== index) {
      setSelected(index)
      return
    }
    const target = placingShip
      ? previewPlacement(state.playerBoard, index, placingShip.length, state.orientation)
      : null
    if (!target?.valid) return
    dispatch({ type: 'place', index })
    setSelected(null)
  }

  const aiTurn = state.phase === 'battle' && state.turn === 'ai'

  useEffect(() => {
    if (!aiTurn) return
    const timer = setTimeout(() => dispatch({ type: 'ai-fire' }), AI_DELAY_MS)
    return () => clearTimeout(timer)
  }, [aiTurn])

  const status =
    state.phase === 'placement'
      ? `Place your ${placingShip?.id ?? ''} (${placingShip?.length ?? 0} cells)${
          touch ? ' — tap to preview, tap again to place' : ''
        }`
      : state.phase === 'end'
        ? state.winner === 'player'
          ? 'You win — enemy fleet destroyed'
          : 'The AI wins — your fleet is destroyed'
        : aiTurn
          ? "AI's turn…"
          : 'Your turn — fire at the enemy waters'

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-sky-950 to-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-sky-100">Battleship AI</h1>
          <p
            aria-live="polite"
            className={`text-sm ${aiTurn ? 'text-amber-300' : 'text-sky-300/80'}`}
          >
            {status}
          </p>
        </header>

        {state.phase === 'placement' && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => dispatch({ type: 'rotate' })}
              className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-medium text-sky-50 transition-colors hover:bg-sky-700"
            >
              Rotate ({state.orientation})
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'random-fleet' })}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-emerald-50 transition-colors hover:bg-emerald-600"
            >
              Random Fleet
            </button>
            <button
              type="button"
              disabled={state.placingIndex === 0}
              onClick={() => {
                setSelected(null)
                dispatch({ type: 'undo-placement' })
              }}
              className="rounded-lg border border-sky-700 px-4 py-2 text-sm font-medium text-sky-200 transition-colors hover:bg-sky-900 disabled:opacity-40"
            >
              Clear board
            </button>
          </div>
        )}

        {state.phase === 'end' && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-700/60 bg-sky-900/50 p-4">
            <p className="text-lg font-semibold text-sky-50">
              {state.winner === 'player' ? 'Victory' : 'Defeat'}
            </p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'restart' })}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            >
              Play again
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3 rounded-xl border border-sky-800/60 bg-slate-900/50 p-4">
            <h2 className="text-sm font-semibold tracking-[0.2em] text-sky-300/80 uppercase">
              Your fleet
            </h2>
            <BoardGrid
              board={state.playerBoard}
              revealShips
              interactive={state.phase === 'placement'}
              label="Your fleet"
              previewIndices={preview?.indices ?? []}
              previewValid={preview?.valid ?? true}
              onCellClick={placeAt}
              onCellEnter={setHovered}
              onCellLeave={() => setHovered(null)}
            />
            <FleetStatus board={state.playerBoard} title="Status" />
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-sky-800/60 bg-slate-900/50 p-4">
            <h2 className="text-sm font-semibold tracking-[0.2em] text-sky-300/80 uppercase">
              Enemy waters
            </h2>
            <BoardGrid
              board={state.enemyBoard}
              revealShips={state.phase === 'end'}
              interactive={state.phase === 'battle' && state.turn === 'player' && !state.busy}
              label="Enemy waters"
              onCellClick={(index) => dispatch({ type: 'player-fire', index })}
            />
            <FleetStatus board={state.enemyBoard} title="Status" />
          </section>
        </div>

        <ShotLog log={state.log} />
      </div>
    </main>
  )
}

export default App
