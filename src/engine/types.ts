export type ShipId = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer'

export interface ShipSpec {
  id: ShipId
  length: number
}

export const FLEET: readonly ShipSpec[] = [
  { id: 'carrier', length: 5 },
  { id: 'battleship', length: 4 },
  { id: 'cruiser', length: 3 },
  { id: 'submarine', length: 3 },
  { id: 'destroyer', length: 2 },
] as const

export type Orientation = 'horizontal' | 'vertical'

export interface Ship {
  id: ShipId
  length: number
  indices: number[]
  hits: number[]
}

export interface Cell {
  shipId: ShipId | null
  fired: boolean
}

export interface Board {
  cells: Cell[]
  ships: Ship[]
}

export type FireResult = 'miss' | 'hit' | 'sunk'

export type PlacementError =
  | 'out-of-bounds'
  | 'overlap'
  | 'duplicate-ship'
  | 'unknown-ship'

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
