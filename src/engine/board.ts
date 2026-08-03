import { BOARD_SIZE, CELL_COUNT, isOnBoard, toCoord, toIndex } from './coords'
import type {
  Board,
  FireResult,
  Orientation,
  PlacementError,
  Result,
  Ship,
  ShipId,
} from './types'
import { FLEET } from './types'

export function createBoard(): Board {
  return {
    cells: Array.from({ length: CELL_COUNT }, () => ({ shipId: null, fired: false })),
    ships: [],
  }
}

function shipIndices(
  startRow: number,
  startCol: number,
  length: number,
  orientation: Orientation,
): number[] | null {
  const indices: number[] = []
  for (let step = 0; step < length; step += 1) {
    const row = orientation === 'vertical' ? startRow + step : startRow
    const col = orientation === 'horizontal' ? startCol + step : startCol
    if (!isOnBoard(row, col)) return null
    indices.push(toIndex(row, col))
  }
  return indices
}

export function placeShip(
  board: Board,
  shipId: ShipId,
  startRow: number,
  startCol: number,
  orientation: Orientation,
): Result<Board, PlacementError> {
  const spec = FLEET.find((entry) => entry.id === shipId)
  if (!spec) return { ok: false, error: 'unknown-ship' }
  if (board.ships.some((ship) => ship.id === shipId)) {
    return { ok: false, error: 'duplicate-ship' }
  }
  if (!isOnBoard(startRow, startCol)) return { ok: false, error: 'out-of-bounds' }

  const indices = shipIndices(startRow, startCol, spec.length, orientation)
  if (!indices) return { ok: false, error: 'out-of-bounds' }
  if (indices.some((index) => board.cells[index].shipId !== null)) {
    return { ok: false, error: 'overlap' }
  }

  const ship: Ship = { id: spec.id, length: spec.length, indices, hits: [] }
  const cells = board.cells.map((cell, index) =>
    indices.includes(index) ? { ...cell, shipId: spec.id } : cell,
  )
  return { ok: true, value: { cells, ships: [...board.ships, ship] } }
}

export function randomPlacement(random: () => number = Math.random): Board {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let board = createBoard()
    let complete = true
    for (const spec of FLEET) {
      let placed = false
      for (let tries = 0; tries < 500 && !placed; tries += 1) {
        const orientation: Orientation = random() < 0.5 ? 'horizontal' : 'vertical'
        const row = Math.floor(random() * BOARD_SIZE)
        const col = Math.floor(random() * BOARD_SIZE)
        const result = placeShip(board, spec.id, row, col, orientation)
        if (result.ok) {
          board = result.value
          placed = true
        }
      }
      if (!placed) {
        complete = false
        break
      }
    }
    if (complete) return board
  }
  throw new Error('randomPlacement: unable to generate a valid fleet')
}

export type FireError = 'out-of-bounds' | 'already-fired'

export function fireAt(
  board: Board,
  index: number,
): Result<{ board: Board; result: FireResult }, FireError> {
  if (!Number.isInteger(index) || index < 0 || index >= board.cells.length) {
    return { ok: false, error: 'out-of-bounds' }
  }
  const cell = board.cells[index]
  if (cell.fired) return { ok: false, error: 'already-fired' }

  const cells = board.cells.map((entry, i) =>
    i === index ? { ...entry, fired: true } : entry,
  )
  if (cell.shipId === null) {
    return { ok: true, value: { board: { cells, ships: board.ships }, result: 'miss' } }
  }

  const ships = board.ships.map((ship) =>
    ship.id === cell.shipId ? { ...ship, hits: [...ship.hits, index] } : ship,
  )
  const hitShip = ships.find((ship) => ship.id === cell.shipId)!
  const result: FireResult = isSunk(hitShip) ? 'sunk' : 'hit'
  return { ok: true, value: { board: { cells, ships }, result } }
}

export function isSunk(ship: Ship): boolean {
  return ship.indices.every((index) => ship.hits.includes(index))
}

export function isFleetDestroyed(board: Board): boolean {
  return board.ships.length === FLEET.length && board.ships.every(isSunk)
}

export { toIndex, toCoord }
