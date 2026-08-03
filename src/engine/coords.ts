export const BOARD_SIZE = 10
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE

export interface Coord {
  row: number
  col: number
}

export function toIndex(row: number, col: number): number {
  return row * BOARD_SIZE + col
}

export function toCoord(index: number): Coord {
  return { row: Math.floor(index / BOARD_SIZE), col: index % BOARD_SIZE }
}

export function isOnBoard(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
}
