import { toCoord } from '../engine'
import type { Board } from '../engine'
import { isSunkAt } from '../game/state'

export const COLUMNS = 'ABCDEFGHIJ'.split('')

export function cellLabel(index: number): string {
  const { row, col } = toCoord(index)
  return `${COLUMNS[col]}${row + 1}`
}

export type CellKind = 'water' | 'ship' | 'miss' | 'hit' | 'sunk'

export const CELL_STYLES: Record<CellKind, string> = {
  water: 'bg-sky-950/70',
  ship: 'bg-slate-400/80',
  miss: 'bg-sky-900/70',
  hit: 'bg-amber-400',
  sunk: 'bg-rose-600 ring-2 ring-inset ring-rose-200',
}

export function cellKind(board: Board, index: number, revealShips: boolean): CellKind {
  const cell = board.cells[index]
  if (cell.fired) {
    if (cell.shipId === null) return 'miss'
    return isSunkAt(board, index) ? 'sunk' : 'hit'
  }
  return revealShips && cell.shipId !== null ? 'ship' : 'water'
}
