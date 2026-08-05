import { describe, expect, it } from 'vitest'
import { FLEET, createBoard, fireAt, placeShip, toIndex } from '../engine'
import type { Board } from '../engine'
import {
  createGameState,
  gameReducer,
  isValidPreview,
  previewIndices,
  previewPlacement,
} from './state'
import type { GameState } from './state'

function fleetBoard(): Board {
  let board = createBoard()
  let row = 0
  for (const spec of FLEET) {
    const placed = placeShip(board, spec.id, row, 0, 'horizontal')
    if (!placed.ok) throw new Error(placed.error)
    board = placed.value
    row += 1
  }
  return board
}

describe('placement phase', () => {
  it('places the fleet in order and enters the battle phase', () => {
    let state = createGameState()
    for (let row = 0; row < FLEET.length; row += 1) {
      state = gameReducer(state, { type: 'place', index: toIndex(row, 0) })
    }
    expect(state.playerBoard.ships.map((ship) => ship.id)).toEqual(
      FLEET.map((spec) => spec.id),
    )
    expect(state.phase).toBe('battle')
    expect(state.turn).toBe('player')
  })

  it('ignores an overlapping placement', () => {
    let state = createGameState()
    state = gameReducer(state, { type: 'place', index: toIndex(0, 0) })
    const afterCarrier = state
    state = gameReducer(state, { type: 'place', index: toIndex(0, 1) })
    expect(state).toBe(afterCarrier)
  })

  it('rotates the orientation', () => {
    const state = gameReducer(createGameState(), { type: 'rotate' })
    expect(state.orientation).toBe('vertical')
  })

  it('places every ship at once with a random fleet', () => {
    const state = gameReducer(createGameState(), { type: 'random-fleet' })
    expect(state.playerBoard.ships).toHaveLength(FLEET.length)
    expect(state.phase).toBe('battle')
  })

  it('marks a preview running off the board as invalid', () => {
    const board = createBoard()
    expect(previewIndices(toIndex(0, 7), 5, 'horizontal')).toBeNull()
    expect(isValidPreview(board, previewIndices(toIndex(0, 7), 5, 'horizontal'))).toBe(false)
    expect(isValidPreview(board, previewIndices(toIndex(0, 0), 5, 'horizontal'))).toBe(true)
  })

  it('outlines the on-board part of a ship that runs off the edge', () => {
    const board = createBoard()
    expect(previewPlacement(board, toIndex(2, 6), 5, 'horizontal')).toEqual({
      indices: [toIndex(2, 6), toIndex(2, 7), toIndex(2, 8), toIndex(2, 9)],
      valid: false,
    })
    expect(previewPlacement(board, toIndex(8, 3), 5, 'vertical')).toEqual({
      indices: [toIndex(8, 3), toIndex(9, 3)],
      valid: false,
    })
  })

  it('marks an overlapping preview invalid but keeps the full outline', () => {
    const placed = placeShip(createBoard(), 'destroyer', 0, 0, 'horizontal')
    if (!placed.ok) throw new Error(placed.error)
    expect(previewPlacement(placed.value, toIndex(0, 1), 3, 'horizontal')).toEqual({
      indices: [toIndex(0, 1), toIndex(0, 2), toIndex(0, 3)],
      valid: false,
    })
  })
})

describe('battle phase', () => {
  const battleState = (): GameState => ({
    ...createGameState(),
    phase: 'battle',
    playerBoard: fleetBoard(),
  })

  it('logs a player shot and hands the turn to the AI', () => {
    const state = gameReducer(battleState(), { type: 'player-fire', index: 0 })
    expect(state.log).toHaveLength(1)
    expect(state.log[0].side).toBe('player')
    expect(state.turn).toBe('ai')
    expect(state.busy).toBe(true)
  })

  it('rejects a player shot while the AI is to move', () => {
    const state = { ...battleState(), turn: 'ai' as const, busy: true }
    expect(gameReducer(state, { type: 'player-fire', index: 5 })).toBe(state)
  })

  it('rejects a repeated shot on the same cell', () => {
    let state = gameReducer(battleState(), { type: 'player-fire', index: 0 })
    state = gameReducer(state, { type: 'ai-fire' })
    const before = state
    expect(gameReducer(state, { type: 'player-fire', index: 0 })).toBe(before)
  })

  it('lets the AI fire and return the turn', () => {
    let state = gameReducer(battleState(), { type: 'player-fire', index: 0 })
    state = gameReducer(state, { type: 'ai-fire' })
    expect(state.log).toHaveLength(2)
    expect(state.log[1].side).toBe('ai')
    expect(state.turn).toBe('player')
    expect(state.busy).toBe(false)
  })

  it('ends the game when the enemy fleet is destroyed', () => {
    let state = battleState()
    const enemyCells = state.enemyBoard.ships.flatMap((ship) => ship.indices)
    for (const index of enemyCells.slice(0, -1)) {
      const shot = fireAt(state.enemyBoard, index)
      if (!shot.ok) throw new Error(shot.error)
      state = { ...state, enemyBoard: shot.value.board }
    }
    state = gameReducer(state, {
      type: 'player-fire',
      index: enemyCells[enemyCells.length - 1],
    })
    expect(state.phase).toBe('end')
    expect(state.winner).toBe('player')
  })

  it('ends the game when the AI destroys the player fleet', () => {
    let state: GameState = { ...battleState(), turn: 'ai' }
    let guard = 0
    while (state.phase === 'battle' && guard < 200) {
      state = gameReducer({ ...state, turn: 'ai' }, { type: 'ai-fire' })
      guard += 1
    }
    expect(state.phase).toBe('end')
    expect(state.winner).toBe('ai')
    expect(state.log.every((entry) => entry.side === 'ai')).toBe(true)
  })
})

describe('restart', () => {
  it('returns a fresh placement phase', () => {
    const state = gameReducer(
      { ...createGameState(), phase: 'end', winner: 'ai' },
      { type: 'restart' },
    )
    expect(state.phase).toBe('placement')
    expect(state.log).toHaveLength(0)
    expect(state.playerBoard.ships).toHaveLength(0)
  })
})
