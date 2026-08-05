import {
  BOARD_SIZE,
  FLEET,
  createAIState,
  createBoard,
  fireAt,
  isFleetDestroyed,
  isSunk,
  nextShot,
  placeShip,
  randomPlacement,
  recordResult,
  toCoord,
  toIndex,
} from '../engine'
import type {
  AIState,
  Board,
  FireResult,
  Orientation,
  Ship,
  ShipId,
} from '../engine'

export type Phase = 'placement' | 'battle' | 'end'
export type Side = 'player' | 'ai'

export interface LogEntry {
  side: Side
  index: number
  result: FireResult
  shipId: ShipId | null
}

export interface GameState {
  phase: Phase
  playerBoard: Board
  enemyBoard: Board
  orientation: Orientation
  /** Index into FLEET of the ship waiting to be placed. */
  placingIndex: number
  turn: Side
  /** True while the AI's shot is pending; the player board is inert. */
  busy: boolean
  ai: AIState
  log: LogEntry[]
  winner: Side | null
}

export type GameAction =
  | { type: 'place'; index: number }
  | { type: 'rotate' }
  | { type: 'random-fleet' }
  | { type: 'undo-placement' }
  | { type: 'player-fire'; index: number }
  | { type: 'ai-fire' }
  | { type: 'restart' }

export function createGameState(): GameState {
  return {
    phase: 'placement',
    playerBoard: createBoard(),
    enemyBoard: randomPlacement(),
    orientation: 'horizontal',
    placingIndex: 0,
    turn: 'player',
    busy: false,
    ai: createAIState(),
    log: [],
    winner: null,
  }
}

export function shipAt(board: Board, index: number): Ship | undefined {
  const shipId = board.cells[index].shipId
  return shipId === null ? undefined : board.ships.find((ship) => ship.id === shipId)
}

export function isSunkAt(board: Board, index: number): boolean {
  const ship = shipAt(board, index)
  return ship !== undefined && isSunk(ship)
}

/** Cells a ship of `length` would occupy, or null when it runs off the board. */
export function previewIndices(
  index: number,
  length: number,
  orientation: Orientation,
): number[] | null {
  const { row, col } = toCoord(index)
  const indices: number[] = []
  for (let step = 0; step < length; step += 1) {
    const r = orientation === 'vertical' ? row + step : row
    const c = orientation === 'horizontal' ? col + step : col
    if (r >= BOARD_SIZE || c >= BOARD_SIZE) return null
    indices.push(toIndex(r, c))
  }
  return indices
}

export function isValidPreview(board: Board, indices: number[] | null): boolean {
  return indices !== null && indices.every((cell) => board.cells[cell].shipId === null)
}

function cloneAI(ai: AIState): AIState {
  return {
    shots: [...ai.shots],
    hits: [...ai.hits],
    unresolvedHits: [...ai.unresolvedHits],
    targetQueue: [...ai.targetQueue],
    sunkShips: [...ai.sunkShips],
    mode: ai.mode,
  }
}

function logEntry(board: Board, side: Side, index: number, result: FireResult): LogEntry {
  return { side, index, result, shipId: board.cells[index].shipId }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'rotate': {
      if (state.phase !== 'placement') return state
      return {
        ...state,
        orientation: state.orientation === 'horizontal' ? 'vertical' : 'horizontal',
      }
    }

    case 'place': {
      if (state.phase !== 'placement') return state
      const spec = FLEET[state.placingIndex]
      if (!spec) return state
      const { row, col } = toCoord(action.index)
      const placed = placeShip(state.playerBoard, spec.id, row, col, state.orientation)
      if (!placed.ok) return state
      const placingIndex = state.placingIndex + 1
      return {
        ...state,
        playerBoard: placed.value,
        placingIndex,
        phase: placingIndex >= FLEET.length ? 'battle' : 'placement',
      }
    }

    case 'random-fleet': {
      if (state.phase !== 'placement') return state
      return {
        ...state,
        playerBoard: randomPlacement(),
        placingIndex: FLEET.length,
        phase: 'battle',
      }
    }

    case 'undo-placement': {
      if (state.phase !== 'placement' || state.placingIndex === 0) return state
      return { ...state, playerBoard: createBoard(), placingIndex: 0 }
    }

    case 'player-fire': {
      if (state.phase !== 'battle' || state.turn !== 'player' || state.busy) return state
      const shot = fireAt(state.enemyBoard, action.index)
      if (!shot.ok) return state
      const enemyBoard = shot.value.board
      const log = [...state.log, logEntry(enemyBoard, 'player', action.index, shot.value.result)]
      if (isFleetDestroyed(enemyBoard)) {
        return { ...state, enemyBoard, log, phase: 'end', winner: 'player', busy: false }
      }
      return { ...state, enemyBoard, log, turn: 'ai', busy: true }
    }

    case 'ai-fire': {
      if (state.phase !== 'battle' || state.turn !== 'ai') return state
      const ai = cloneAI(state.ai)
      const index = nextShot(ai)
      if (index === null) return { ...state, ai, turn: 'player', busy: false }
      const shot = fireAt(state.playerBoard, index)
      if (!shot.ok) return { ...state, ai, turn: 'player', busy: false }
      const playerBoard = shot.value.board
      const result = shot.value.result
      const shipId = playerBoard.cells[index].shipId
      recordResult(ai, index, result, result === 'sunk' ? (shipId ?? undefined) : undefined)
      const log = [...state.log, logEntry(playerBoard, 'ai', index, result)]
      if (isFleetDestroyed(playerBoard)) {
        return { ...state, playerBoard, ai, log, phase: 'end', winner: 'ai', busy: false }
      }
      return { ...state, playerBoard, ai, log, turn: 'player', busy: false }
    }

    case 'restart':
      return createGameState()

    default:
      return state
  }
}
