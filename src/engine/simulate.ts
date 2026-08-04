/**
 * Headless simulation harness: the hunt/target AI plays complete games against a
 * random shooter while every turn is checked against the engine's invariants.
 *
 * Usage: npm run sim [-- --games=1000] [-- --seed=1]
 */
import { BOARD_SIZE, CELL_COUNT, toCoord } from './coords'
import { fireAt, isFleetDestroyed, isSunk, randomPlacement } from './board'
import { createAIState, nextShot, recordResult } from './ai'
import type { AIState } from './ai'
import type { Board, Ship } from './types'
import { FLEET } from './types'

const MAX_SHOTS_PER_SIDE = 100
const TOTAL_SHIP_CELLS = FLEET.reduce((total, spec) => total + spec.length, 0)

type SideName = 'ai' | 'random'

interface Side {
  name: SideName
  /** Board this side owns; the opponent fires at it. */
  board: Board
  /** Cells this side has fired at, in order. */
  shots: number[]
  firedSet: Set<number>
  hitsTaken: number
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function renderBoard(board: Board): string {
  const header = `    ${Array.from({ length: BOARD_SIZE }, (_, col) => col).join(' ')}`
  const rows: string[] = [header]
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    const cells: string[] = []
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = board.cells[row * BOARD_SIZE + col]
      if (cell.fired) cells.push(cell.shipId === null ? 'o' : 'X')
      else cells.push(cell.shipId === null ? '.' : '#')
    }
    rows.push(`${String(row).padStart(2, ' ')}  ${cells.join(' ')}`)
  }
  return rows.join('\n')
}

function describeShip(ship: Ship): string {
  const cells = ship.indices
    .map((index) => {
      const { row, col } = toCoord(index)
      return `${index}(${row},${col})`
    })
    .join(' ')
  return `${ship.id} len=${ship.length} sunk=${isSunk(ship)} cells=[${cells}] hits=[${ship.hits.join(' ')}]`
}

function formatShots(shots: number[]): string {
  return shots
    .map((index) => {
      const { row, col } = toCoord(index)
      return `${index}(${row},${col})`
    })
    .join(' -> ')
}

class InvariantViolation extends Error {}

function fail(message: string): never {
  throw new InvariantViolation(message)
}

function checkFleet(side: Side): void {
  const { ships } = side.board
  if (ships.length !== FLEET.length) {
    fail(`${side.name} fleet has ${ships.length} ships, expected ${FLEET.length}`)
  }
  const expected = [...FLEET].map((spec) => spec.id).sort()
  const actual = ships.map((ship) => ship.id).sort()
  if (expected.join(',') !== actual.join(',')) {
    fail(`${side.name} fleet ship ids are [${actual.join(',')}], expected [${expected.join(',')}]`)
  }
  const occupied = new Set<number>()
  for (const ship of ships) {
    const spec = FLEET.find((entry) => entry.id === ship.id)!
    if (ship.length !== spec.length || ship.indices.length !== spec.length) {
      fail(`${side.name} ${ship.id} has length ${ship.length}/${ship.indices.length}, expected ${spec.length}`)
    }
    for (const index of ship.indices) {
      if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) {
        fail(`${side.name} ${ship.id} has out-of-bounds cell ${index}`)
      }
      if (occupied.has(index)) fail(`${side.name} ${ship.id} overlaps another ship at cell ${index}`)
      occupied.add(index)
    }
    const coords = ship.indices.map(toCoord)
    const sameRow = coords.every((coord) => coord.row === coords[0].row)
    const sameCol = coords.every((coord) => coord.col === coords[0].col)
    if (!sameRow && !sameCol) fail(`${side.name} ${ship.id} is not straight`)
    if (sameRow) {
      const cols = coords.map((coord) => coord.col).sort((a, b) => a - b)
      if (cols[cols.length - 1] - cols[0] !== spec.length - 1) {
        fail(`${side.name} ${ship.id} wraps or is not contiguous horizontally`)
      }
    } else {
      const rows = coords.map((coord) => coord.row).sort((a, b) => a - b)
      if (rows[rows.length - 1] - rows[0] !== spec.length - 1) {
        fail(`${side.name} ${ship.id} is not contiguous vertically`)
      }
    }
  }
}

interface GameResult {
  winner: SideName | null
  shotsByWinner: number
}

function shoot(shooter: Side, target: Side, index: number): void {
  if (shooter.firedSet.has(index)) {
    fail(`${shooter.name} fired at cell ${index} twice`)
  }
  const outcome = fireAt(target.board, index)
  if (!outcome.ok) {
    fail(`${shooter.name} fire at cell ${index} rejected: ${outcome.error}`)
  }
  shooter.shots.push(index)
  shooter.firedSet.add(index)
  target.board = outcome.value.board
  if (outcome.value.result !== 'miss') target.hitsTaken += 1

  const recordedHits = target.board.ships.reduce((total, ship) => total + ship.hits.length, 0)
  if (recordedHits !== target.hitsTaken) {
    fail(`${target.name} recorded ${recordedHits} hits on ships but took ${target.hitsTaken}`)
  }
  if (isFleetDestroyed(target.board) && target.hitsTaken !== TOTAL_SHIP_CELLS) {
    fail(`${target.name} fleet is destroyed with ${target.hitsTaken} hits, expected ${TOTAL_SHIP_CELLS}`)
  }
  if (shooter.shots.length > MAX_SHOTS_PER_SIDE) {
    fail(`${shooter.name} exceeded ${MAX_SHOTS_PER_SIDE} shots`)
  }
}

interface GameContext {
  ai: Side
  opponent: Side
  aiState: AIState
}

function playGame(random: () => number, context: { current: GameContext | null }): GameResult {
  const ai: Side = {
    name: 'ai',
    board: randomPlacement(random),
    shots: [],
    firedSet: new Set(),
    hitsTaken: 0,
  }
  const opponent: Side = {
    name: 'random',
    board: randomPlacement(random),
    shots: [],
    firedSet: new Set(),
    hitsTaken: 0,
  }
  checkFleet(ai)
  checkFleet(opponent)

  const aiState: AIState = createAIState()
  const randomPool = Array.from({ length: CELL_COUNT }, (_, index) => index)

  context.current = { ai, opponent, aiState }

  for (;;) {
    const aiTarget = nextShot(aiState, random)
    if (aiTarget === null) fail('ai had no legal shot left')
    const before = opponent.board.ships.filter(isSunk).map((ship) => ship.id)
    shoot(ai, opponent, aiTarget)
    const sunkNow = opponent.board.ships
      .filter(isSunk)
      .map((ship) => ship.id)
      .find((id) => !before.includes(id))
    const result = sunkNow ? 'sunk' : opponent.board.cells[aiTarget].shipId ? 'hit' : 'miss'
    recordResult(aiState, aiTarget, result, sunkNow)
    if (aiState.shots.length !== ai.shots.length) {
      fail(`ai state tracked ${aiState.shots.length} shots but ${ai.shots.length} were fired`)
    }
    if (isFleetDestroyed(opponent.board)) {
      if (!opponent.board.ships.every(isSunk)) fail('ai declared winner without sinking every ship')
      return { winner: 'ai', shotsByWinner: ai.shots.length }
    }

    const poolIndex = Math.floor(random() * randomPool.length)
    const randomTarget = randomPool.splice(poolIndex, 1)[0]
    if (randomTarget === undefined) fail('random shooter had no legal shot left')
    shoot(opponent, ai, randomTarget)
    if (isFleetDestroyed(ai.board)) {
      if (!ai.board.ships.every(isSunk)) fail('random shooter declared winner without sinking every ship')
      return { winner: 'random', shotsByWinner: opponent.shots.length }
    }
  }
}

function dump(game: number, seed: number, error: Error, context: GameContext | null): void {
  console.error(`\nINVARIANT VIOLATION in game ${game} (seed ${seed}): ${error.message}`)
  if (!context) return
  const { ai, opponent, aiState } = context
  for (const side of [ai, opponent]) {
    console.error(`\n--- ${side.name} board (owner view; # ship, X hit, o miss) ---`)
    console.error(renderBoard(side.board))
    console.error(side.board.ships.map(describeShip).join('\n'))
    console.error(`hits taken: ${side.hitsTaken}`)
    console.error(`shot sequence (${side.shots.length}): ${formatShots(side.shots)}`)
  }
  console.error(`\n--- ai state ---`)
  console.error(
    `mode=${aiState.mode} unresolvedHits=[${aiState.unresolvedHits.join(' ')}] targetQueue=[${aiState.targetQueue.join(' ')}] sunkShips=[${aiState.sunkShips.join(' ')}]`,
  )
}

function parseArg(name: string, fallback: number): number {
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`))
  if (!raw) return fallback
  const value = Number(raw.split('=')[1])
  return Number.isFinite(value) ? value : fallback
}

interface Stats {
  wins: number
  total: number
  min: number
  max: number
}

function emptyStats(): Stats {
  return { wins: 0, total: 0, min: Number.POSITIVE_INFINITY, max: 0 }
}

function record(stats: Stats, shots: number): void {
  stats.wins += 1
  stats.total += shots
  stats.min = Math.min(stats.min, shots)
  stats.max = Math.max(stats.max, shots)
}

function describeStats(name: string, stats: Stats): string {
  if (stats.wins === 0) return `${name}: 0 wins`
  const average = (stats.total / stats.wins).toFixed(2)
  return `${name}: ${stats.wins} wins, avg shots to win ${average}, min ${stats.min}, max ${stats.max}`
}

function main(): void {
  const games = Math.max(1, Math.floor(parseArg('games', 1000)))
  const seed = Math.floor(parseArg('seed', 1))
  const stats: Record<SideName, Stats> = { ai: emptyStats(), random: emptyStats() }
  let played = 0
  let passed = 0
  let failed = 0

  for (let game = 0; game < games; game += 1) {
    const random = mulberry32(seed + game)
    const context: { current: GameContext | null } = { current: null }
    played += 1
    try {
      const result = playGame(random, context)
      passed += 1
      if (result.winner) record(stats[result.winner], result.shotsByWinner)
    } catch (error) {
      failed += 1
      dump(game, seed + game, error as Error, context.current)
      console.error(
        `\nSummary (aborted): games played ${played}, passed ${passed}, failed ${failed}\n${describeStats('ai', stats.ai)}\n${describeStats('random', stats.random)}`,
      )
      process.exit(1)
    }
  }

  console.log(`games played: ${played}`)
  console.log(`passed: ${passed}`)
  console.log(`failed: ${failed}`)
  console.log(describeStats('ai', stats.ai))
  console.log(describeStats('random', stats.random))
}

main()
