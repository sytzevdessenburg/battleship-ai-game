import { BOARD_SIZE, CELL_COUNT, isOnBoard, toCoord, toIndex } from './coords'
import type { FireResult, ShipId } from './types'
import { FLEET } from './types'

export type Axis = 'row' | 'col'

export interface AIState {
  /** Every cell the AI has fired at, in order. */
  shots: number[]
  /** Cells that returned 'hit' and are not yet attributed to a sunk ship. */
  unresolvedHits: number[]
  /** Pending candidate cells while in target mode, highest priority first. */
  targetQueue: number[]
  /** Ships the AI has confirmed sunk. */
  sunkShips: ShipId[]
  mode: 'hunt' | 'target'
}

export function createAIState(): AIState {
  return { shots: [], unresolvedHits: [], targetQueue: [], sunkShips: [], mode: 'hunt' }
}

function neighbors(index: number): number[] {
  const { row, col } = toCoord(index)
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ]
    .filter(([r, c]) => isOnBoard(r, c))
    .map(([r, c]) => toIndex(r, c))
}

function sameAxis(a: number, b: number, axis: Axis): boolean {
  const first = toCoord(a)
  const second = toCoord(b)
  return axis === 'row' ? first.row === second.row : first.col === second.col
}

const STEP: Record<Axis, number> = { row: 1, col: BOARD_SIZE }

/** Contiguous runs of hits along an axis, taken from the given hit set. */
function collinearRuns(hits: number[], axis: Axis): number[][] {
  const set = new Set(hits)
  const runs: number[][] = []
  const step = STEP[axis]
  for (const hit of [...hits].sort((a, b) => a - b)) {
    const previous = hit - step
    if (set.has(previous) && sameAxis(previous, hit, axis)) continue
    const run = [hit]
    let next = hit + step
    while (set.has(next) && sameAxis(next, run[run.length - 1], axis)) {
      run.push(next)
      next += step
    }
    if (run.length > 1) runs.push(run)
  }
  return runs
}

export function smallestRemainingLength(state: AIState): number {
  const remaining = FLEET.filter((ship) => !state.sunkShips.includes(ship.id))
  if (remaining.length === 0) return 1
  return Math.min(...remaining.map((ship) => ship.length))
}

export function parityCandidates(state: AIState, offset = 0): number[] {
  const modulus = smallestRemainingLength(state)
  const fired = new Set(state.shots)
  const all: number[] = []
  const onParity: number[] = []
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (fired.has(index)) continue
    all.push(index)
    const { row, col } = toCoord(index)
    if ((row + col) % modulus === offset % modulus) onParity.push(index)
  }
  return onParity.length > 0 ? onParity : all
}

/**
 * Candidate cells around unresolved hits. Runs of two or more collinear hits are
 * extended along their own axis before isolated hits are probed in all directions.
 */
export function targetCandidates(state: AIState): number[] {
  const fired = new Set(state.shots)
  const extensions: number[] = []
  const inRun = new Set<number>()

  for (const axis of ['row', 'col'] as Axis[]) {
    for (const run of collinearRuns(state.unresolvedHits, axis)) {
      run.forEach((hit) => inRun.add(hit))
      const step = STEP[axis]
      const low = run[0] - step
      const high = run[run.length - 1] + step
      if (!fired.has(low) && low >= 0 && sameAxis(low, run[0], axis)) extensions.push(low)
      if (!fired.has(high) && high < CELL_COUNT && sameAxis(high, run[run.length - 1], axis)) {
        extensions.push(high)
      }
    }
  }

  const probes = state.unresolvedHits
    .filter((hit) => !inRun.has(hit))
    .flatMap((hit) => neighbors(hit))
    .filter((candidate) => !fired.has(candidate))

  return [...new Set([...extensions, ...probes])]
}

export function nextShot(state: AIState, random: () => number = Math.random): number | null {
  if (state.unresolvedHits.length > 0) {
    state.targetQueue = targetCandidates(state)
    state.mode = 'target'
    if (state.targetQueue.length > 0) return state.targetQueue[0]
  }

  state.mode = 'hunt'
  state.targetQueue = []
  const candidates = parityCandidates(state)
  if (candidates.length === 0) return null
  return candidates[Math.floor(random() * candidates.length)]
}

/**
 * Cells the sunk ship occupied, inferred from the AI's own unresolved hits: a
 * collinear window of length `length` through the killing shot.
 *
 * A run of unresolved hits can be longer than the ship that just sank, so several
 * windows qualify. The oldest hits are preferred: the ship that sinks is the one the
 * AI has been working on longest, while newer hits at the far end of the run belong to
 * a neighbouring ship the AI has only just bumped into.
 */
function inferSunkCells(state: AIState, index: number, length: number): number[] {
  const hits = state.unresolvedHits
  const shotOrder = new Map(state.shots.map((shot, order) => [shot, order]))
  const age = (cell: number) => shotOrder.get(cell) ?? Number.MAX_SAFE_INTEGER

  let best: number[] | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const axis of ['row', 'col'] as Axis[]) {
    for (const run of collinearRuns(hits, axis)) {
      if (!run.includes(index) || run.length < length) continue
      for (let start = 0; start + length <= run.length; start += 1) {
        const window = run.slice(start, start + length)
        if (!window.includes(index)) continue
        const score = window
          .filter((cell) => cell !== index)
          .reduce((total, cell) => total + age(cell), 0)
        if (score < bestScore) {
          best = window
          bestScore = score
        }
      }
    }
  }
  if (best) return best
  return length === 1 ? [index] : hits.includes(index) ? [index] : []
}

export function recordResult(
  state: AIState,
  index: number,
  result: FireResult,
  sunkShipId?: ShipId,
): AIState {
  state.shots.push(index)

  if (result === 'hit') {
    state.unresolvedHits.push(index)
  } else if (result === 'sunk') {
    const spec = FLEET.find((ship) => ship.id === sunkShipId)
    if (!spec) throw new Error('recordResult: a sunk result requires the sunk ship id')
    state.unresolvedHits.push(index)
    state.sunkShips.push(spec.id)
    const sunkCells = inferSunkCells(state, index, spec.length)
    state.unresolvedHits = state.unresolvedHits.filter((hit) => !sunkCells.includes(hit))
  }

  state.mode = state.unresolvedHits.length > 0 ? 'target' : 'hunt'
  state.targetQueue = state.mode === 'target' ? targetCandidates(state) : []
  return state
}
