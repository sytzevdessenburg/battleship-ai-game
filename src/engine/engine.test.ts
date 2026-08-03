import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  CELL_COUNT,
  FLEET,
  createBoard,
  fireAt,
  isFleetDestroyed,
  placeShip,
  randomPlacement,
  toCoord,
  toIndex,
} from './index'
import type { Board, ShipId } from './types'

function place(board: Board, id: ShipId, row: number, col: number, o: 'horizontal' | 'vertical') {
  const result = placeShip(board, id, row, col, o)
  if (!result.ok) throw new Error(`unexpected placement failure: ${result.error}`)
  return result.value
}

describe('coords', () => {
  it('round-trips between index and coordinate', () => {
    for (let index = 0; index < CELL_COUNT; index += 1) {
      const { row, col } = toCoord(index)
      expect(toIndex(row, col)).toBe(index)
    }
  })

  it('maps row/col in row-major order', () => {
    expect(toIndex(0, 0)).toBe(0)
    expect(toIndex(0, 9)).toBe(9)
    expect(toIndex(1, 0)).toBe(10)
    expect(toIndex(9, 9)).toBe(99)
    expect(toCoord(10)).toEqual({ row: 1, col: 0 })
  })
})

describe('fleet', () => {
  it('has the five ships with stable ids and lengths', () => {
    expect(FLEET).toEqual([
      { id: 'carrier', length: 5 },
      { id: 'battleship', length: 4 },
      { id: 'cruiser', length: 3 },
      { id: 'submarine', length: 3 },
      { id: 'destroyer', length: 2 },
    ])
  })
})

describe('createBoard', () => {
  it('creates 100 empty cells', () => {
    const board = createBoard()
    expect(board.cells).toHaveLength(100)
    expect(board.cells.every((cell) => cell.shipId === null && !cell.fired)).toBe(true)
    expect(board.ships).toHaveLength(0)
  })
})

describe('placeShip', () => {
  it('places a ship on consecutive cells', () => {
    const board = place(createBoard(), 'carrier', 2, 3, 'horizontal')
    expect(board.ships[0].indices).toEqual([23, 24, 25, 26, 27])
    expect(board.cells[23].shipId).toBe('carrier')
  })

  it('places vertically', () => {
    const board = place(createBoard(), 'destroyer', 8, 0, 'vertical')
    expect(board.ships[0].indices).toEqual([toIndex(8, 0), toIndex(9, 0)])
  })

  it('accepts a horizontal carrier that ends exactly at the right edge', () => {
    const board = place(createBoard(), 'carrier', 0, 5, 'horizontal')
    expect(board.ships[0].indices).toEqual([
      toIndex(0, 5),
      toIndex(0, 6),
      toIndex(0, 7),
      toIndex(0, 8),
      toIndex(0, 9),
    ])
    expect(board.ships[0].indices.map(toCoord)).toEqual([
      { row: 0, col: 5 },
      { row: 0, col: 6 },
      { row: 0, col: 7 },
      { row: 0, col: 8 },
      { row: 0, col: 9 },
    ])
  })

  it('accepts a vertical carrier that ends exactly at the bottom edge', () => {
    const board = place(createBoard(), 'carrier', 5, 0, 'vertical')
    expect(board.ships[0].indices).toEqual([
      toIndex(5, 0),
      toIndex(6, 0),
      toIndex(7, 0),
      toIndex(8, 0),
      toIndex(9, 0),
    ])
    expect(board.ships[0].indices.map(toCoord)).toEqual([
      { row: 5, col: 0 },
      { row: 6, col: 0 },
      { row: 7, col: 0 },
      { row: 8, col: 0 },
      { row: 9, col: 0 },
    ])
  })

  it('rejects horizontal placement that would wrap across the row edge', () => {
    const result = placeShip(createBoard(), 'carrier', 0, 7, 'horizontal')
    expect(result).toEqual({ ok: false, error: 'out-of-bounds' })
  })

  it('rejects vertical placement running off the bottom', () => {
    const result = placeShip(createBoard(), 'battleship', 8, 4, 'vertical')
    expect(result).toEqual({ ok: false, error: 'out-of-bounds' })
  })

  it('rejects a start coordinate off the board', () => {
    expect(placeShip(createBoard(), 'destroyer', -1, 0, 'horizontal')).toEqual({
      ok: false,
      error: 'out-of-bounds',
    })
    expect(placeShip(createBoard(), 'destroyer', 0, BOARD_SIZE, 'vertical')).toEqual({
      ok: false,
      error: 'out-of-bounds',
    })
  })

  it('rejects overlapping placements', () => {
    const board = place(createBoard(), 'carrier', 0, 0, 'horizontal')
    expect(placeShip(board, 'cruiser', 0, 4, 'vertical')).toEqual({
      ok: false,
      error: 'overlap',
    })
  })

  it('rejects placing the same ship twice', () => {
    const board = place(createBoard(), 'cruiser', 0, 0, 'horizontal')
    expect(placeShip(board, 'cruiser', 5, 0, 'horizontal')).toEqual({
      ok: false,
      error: 'duplicate-ship',
    })
  })

  it('does not mutate the input board', () => {
    const board = createBoard()
    place(board, 'carrier', 0, 0, 'horizontal')
    expect(board.ships).toHaveLength(0)
    expect(board.cells[0].shipId).toBeNull()
  })
})

describe('randomPlacement', () => {
  it('generates a full valid fleet', () => {
    for (let run = 0; run < 50; run += 1) {
      const board = randomPlacement()
      expect(board.ships).toHaveLength(FLEET.length)
      const occupied = board.cells.filter((cell) => cell.shipId !== null)
      expect(occupied).toHaveLength(5 + 4 + 3 + 3 + 2)
      for (const ship of board.ships) {
        expect(ship.indices).toHaveLength(ship.length)
        const coords = ship.indices.map(toCoord)
        const sameRow = coords.every((c) => c.row === coords[0].row)
        const sameCol = coords.every((c) => c.col === coords[0].col)
        expect(sameRow || sameCol).toBe(true)
        for (let i = 1; i < ship.indices.length; i += 1) {
          const step = ship.indices[i] - ship.indices[i - 1]
          expect(sameRow ? step === 1 : step === BOARD_SIZE).toBe(true)
        }
      }
    }
  })
})

describe('fireAt', () => {
  it('reports a miss on empty water', () => {
    const result = fireAt(createBoard(), 55)
    expect(result.ok && result.value.result).toBe('miss')
    expect(result.ok && result.value.board.cells[55].fired).toBe(true)
  })

  it('reports hit then sunk', () => {
    let board = place(createBoard(), 'destroyer', 0, 0, 'horizontal')
    const first = fireAt(board, toIndex(0, 0))
    expect(first.ok && first.value.result).toBe('hit')
    board = first.ok ? first.value.board : board
    const second = fireAt(board, toIndex(0, 1))
    expect(second.ok && second.value.result).toBe('sunk')
  })

  it('rejects firing on the same cell twice', () => {
    const first = fireAt(createBoard(), 42)
    const board = first.ok ? first.value.board : createBoard()
    expect(fireAt(board, 42)).toEqual({ ok: false, error: 'already-fired' })
  })

  it('rejects a repeat shot on a hit ship cell', () => {
    const board = place(createBoard(), 'cruiser', 3, 3, 'horizontal')
    const shot = fireAt(board, toIndex(3, 3))
    const after = shot.ok ? shot.value.board : board
    expect(fireAt(after, toIndex(3, 3))).toEqual({ ok: false, error: 'already-fired' })
  })

  it('rejects out-of-range indices', () => {
    expect(fireAt(createBoard(), -1)).toEqual({ ok: false, error: 'out-of-bounds' })
    expect(fireAt(createBoard(), CELL_COUNT)).toEqual({ ok: false, error: 'out-of-bounds' })
  })
})

describe('win condition', () => {
  it('is won only when all five ships are sunk', () => {
    let board = randomPlacement()
    expect(isFleetDestroyed(board)).toBe(false)
    const targets = board.ships.flatMap((ship) => ship.indices)
    for (let i = 0; i < targets.length; i += 1) {
      const shot = fireAt(board, targets[i])
      expect(shot.ok).toBe(true)
      board = shot.ok ? shot.value.board : board
      if (i < targets.length - 1) expect(isFleetDestroyed(board)).toBe(false)
    }
    expect(isFleetDestroyed(board)).toBe(true)
  })

  it('is not won when only part of the fleet is placed and sunk', () => {
    let board = place(createBoard(), 'destroyer', 0, 0, 'horizontal')
    for (const index of [toIndex(0, 0), toIndex(0, 1)]) {
      const shot = fireAt(board, index)
      board = shot.ok ? shot.value.board : board
    }
    expect(isFleetDestroyed(board)).toBe(false)
  })
})
