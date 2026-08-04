import { describe, expect, it } from 'vitest'
import {
  createAIState,
  nextShot,
  parityCandidates,
  recordResult,
  smallestRemainingLength,
} from './ai'
import { fireAt, isFleetDestroyed, isSunk, randomPlacement, toCoord, toIndex } from './index'
import type { Board, ShipId } from './types'

function fire(board: Board, index: number) {
  const shot = fireAt(board, index)
  if (!shot.ok) throw new Error(`unexpected fire failure: ${shot.error}`)
  return shot.value
}

describe('hunt mode', () => {
  it('restricts candidates by the parity of the smallest ship afloat', () => {
    const state = createAIState()
    expect(smallestRemainingLength(state)).toBe(2)
    expect(parityCandidates(state).every((index) => {
      const { row, col } = toCoord(index)
      return (row + col) % 2 === 0
    })).toBe(true)

    state.sunkShips.push('destroyer')
    expect(smallestRemainingLength(state)).toBe(3)
    expect(parityCandidates(state).every((index) => {
      const { row, col } = toCoord(index)
      return (row + col) % 3 === 0
    })).toBe(true)
  })

  it('never proposes a cell it has already fired at', () => {
    const state = createAIState()
    recordResult(state, toIndex(0, 0), 'miss')
    expect(parityCandidates(state)).not.toContain(toIndex(0, 0))
  })

  it('returns null once the whole board has been fired at', () => {
    const state = createAIState()
    for (let index = 0; index < 100; index += 1) recordResult(state, index, 'miss')
    expect(nextShot(state)).toBeNull()
  })
})

describe('target mode', () => {
  it('probes the neighbours of an isolated hit', () => {
    const state = createAIState()
    recordResult(state, toIndex(4, 4), 'hit')
    expect(state.mode).toBe('target')
    expect(new Set(state.targetQueue)).toEqual(
      new Set([toIndex(3, 4), toIndex(5, 4), toIndex(4, 3), toIndex(4, 5)]),
    )
  })

  it('extends along a row once two hits are collinear', () => {
    const state = createAIState()
    recordResult(state, toIndex(4, 4), 'hit')
    recordResult(state, toIndex(4, 5), 'hit')
    expect(state.mode).toBe('target')
    expect(new Set(state.targetQueue)).toEqual(new Set([toIndex(4, 3), toIndex(4, 6)]))
    expect(state.targetQueue).not.toContain(toIndex(3, 4))
    expect(state.targetQueue).not.toContain(toIndex(5, 5))
  })

  it('extends along a column once two hits are collinear', () => {
    const state = createAIState()
    recordResult(state, toIndex(4, 4), 'hit')
    recordResult(state, toIndex(5, 4), 'hit')
    expect(new Set(state.targetQueue)).toEqual(new Set([toIndex(3, 4), toIndex(6, 4)]))
  })

  it('keeps extending in the other direction after a miss at one end', () => {
    const state = createAIState()
    recordResult(state, toIndex(4, 4), 'hit')
    recordResult(state, toIndex(4, 5), 'hit')
    recordResult(state, toIndex(4, 6), 'miss')
    expect(state.targetQueue).toEqual([toIndex(4, 3)])
    expect(nextShot(state)).toBe(toIndex(4, 3))
  })

  it('does not extend a row run across the board edge', () => {
    const state = createAIState()
    recordResult(state, toIndex(3, 0), 'hit')
    recordResult(state, toIndex(3, 1), 'hit')
    expect(state.targetQueue).toEqual([toIndex(3, 2)])
  })
})

describe('sinking', () => {
  it('returns to hunt mode when no unresolved hits remain', () => {
    const state = createAIState()
    recordResult(state, toIndex(2, 2), 'hit')
    recordResult(state, toIndex(2, 3), 'sunk', 'destroyer')
    expect(state.unresolvedHits).toEqual([])
    expect(state.targetQueue).toEqual([])
    expect(state.mode).toBe('hunt')
    expect(state.sunkShips).toEqual(['destroyer'])
  })

  it('removes only the sunk ship cells and stays in target mode for the other ship', () => {
    const state = createAIState()
    // Destroyer at (0,0)-(0,1); a probe lands on a different ship at (1,1).
    recordResult(state, toIndex(0, 0), 'hit')
    recordResult(state, toIndex(1, 1), 'hit')
    recordResult(state, toIndex(0, 1), 'sunk', 'destroyer')

    expect(state.unresolvedHits).toEqual([toIndex(1, 1)])
    expect(state.mode).toBe('target')
    expect(new Set(state.targetQueue)).toEqual(
      new Set([toIndex(0, 1), toIndex(2, 1), toIndex(1, 0), toIndex(1, 2)].filter(
        (index) => !state.shots.includes(index),
      )),
    )
    expect(state.targetQueue).not.toContain(toIndex(0, 1))
  })

  it('does not strand hits from a second ship discovered along the same axis', () => {
    const state = createAIState()
    // Cruiser at (5,1)-(5,3) plus a separate ship cell at (5,4).
    recordResult(state, toIndex(5, 1), 'hit')
    recordResult(state, toIndex(5, 2), 'hit')
    recordResult(state, toIndex(5, 4), 'hit')
    recordResult(state, toIndex(5, 3), 'sunk', 'cruiser')

    expect(state.unresolvedHits).toEqual([toIndex(5, 4)])
    expect(state.mode).toBe('target')
  })

  it('clears every cell of a sunk ship when the unresolved hits form an L', () => {
    const state = createAIState()
    // Cruiser at (4,1)-(4,3) and a destroyer at (3,4)-(4,4) meeting at a corner,
    // so the unresolved hits are an L and no collinear run spans the cruiser.
    recordResult(state, toIndex(4, 2), 'hit')
    recordResult(state, toIndex(4, 3), 'hit')
    recordResult(state, toIndex(3, 4), 'hit')
    recordResult(state, toIndex(4, 4), 'sunk', 'destroyer')
    recordResult(state, toIndex(4, 1), 'sunk', 'cruiser')

    expect(state.unresolvedHits).not.toContain(toIndex(4, 1))
    expect(state.unresolvedHits).not.toContain(toIndex(4, 2))
    expect(state.unresolvedHits).not.toContain(toIndex(4, 3))
  })

  it('attributes the correct window when the hit run is longer than the sunk ship', () => {
    const state = createAIState()
    // Cruiser at (0,0)-(0,2), submarine at (0,3)-(0,5).
    recordResult(state, toIndex(0, 5), 'hit')
    recordResult(state, toIndex(0, 4), 'hit')
    recordResult(state, toIndex(0, 2), 'hit')
    recordResult(state, toIndex(0, 1), 'hit')
    recordResult(state, toIndex(0, 3), 'sunk', 'submarine')

    expect(state.unresolvedHits).toContain(toIndex(0, 1))
    expect(state.unresolvedHits).toContain(toIndex(0, 2))
    expect(state.unresolvedHits).not.toContain(toIndex(0, 4))
    expect(state.unresolvedHits).not.toContain(toIndex(0, 5))
  })
})

describe('full game', () => {
  it('never repeats a shot and sinks the whole fleet', () => {
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }

    for (let game = 0; game < 25; game += 1) {
      let board = randomPlacement(random)
      const state = createAIState()
      const seen = new Set<number>()
      let shots = 0

      while (!isFleetDestroyed(board) && shots < 100) {
        const index = nextShot(state, random)
        expect(index).not.toBeNull()
        expect(seen.has(index!)).toBe(false)
        seen.add(index!)

        const before = board
        const outcome = fire(board, index!)
        board = outcome.board
        let sunkShipId: ShipId | undefined
        if (outcome.result === 'sunk') {
          const justSunk = board.ships.find(
            (ship) => isSunk(ship) && !isSunk(before.ships.find((s) => s.id === ship.id)!),
          )
          sunkShipId = justSunk?.id
        }
        recordResult(state, index!, outcome.result, sunkShipId)
        shots += 1
      }

      expect(isFleetDestroyed(board)).toBe(true)
      expect(state.shots).toHaveLength(new Set(state.shots).size)
      expect(state.sunkShips).toHaveLength(5)
      expect(state.mode).toBe('hunt')
    }
  })
})
