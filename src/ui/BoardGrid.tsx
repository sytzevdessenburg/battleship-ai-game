import { BOARD_SIZE } from '../engine'
import type { Board } from '../engine'
import { CELL_STYLES, COLUMNS, cellKind, cellLabel } from './cells'

interface BoardGridProps {
  board: Board
  revealShips: boolean
  interactive: boolean
  label: string
  previewIndices?: number[]
  previewValid?: boolean
  onCellClick?: (index: number) => void
  onCellEnter?: (index: number) => void
  onCellLeave?: () => void
}

export function BoardGrid({
  board,
  revealShips,
  interactive,
  label,
  previewIndices = [],
  previewValid = true,
  onCellClick,
  onCellEnter,
  onCellLeave,
}: BoardGridProps) {
  const preview = new Set(previewIndices)

  return (
    <div className="w-full">
      <div className="grid grid-cols-[1.25rem_repeat(10,minmax(0,1fr))] gap-[2px] text-[0.6rem] text-sky-300/70 sm:text-xs">
        <span aria-hidden />
        {COLUMNS.map((column) => (
          <span key={column} className="text-center font-medium">
            {column}
          </span>
        ))}
        {Array.from({ length: BOARD_SIZE }, (_, row) => (
          <Row
            key={row}
            row={row}
            board={board}
            revealShips={revealShips}
            interactive={interactive}
            label={label}
            preview={preview}
            previewValid={previewValid}
            onCellClick={onCellClick}
            onCellEnter={onCellEnter}
            onCellLeave={onCellLeave}
          />
        ))}
      </div>
    </div>
  )
}

interface RowProps extends Omit<BoardGridProps, 'previewIndices'> {
  row: number
  preview: Set<number>
}

function Row({
  row,
  board,
  revealShips,
  interactive,
  label,
  preview,
  previewValid = true,
  onCellClick,
  onCellEnter,
  onCellLeave,
}: RowProps) {
  return (
    <>
      <span className="flex items-center justify-center font-medium">{row + 1}</span>
      {Array.from({ length: BOARD_SIZE }, (_, col) => {
        const index = row * BOARD_SIZE + col
        const kind = cellKind(board, index, revealShips)
        const previewed = preview.has(index)
        const previewStyle = previewed
          ? previewValid
            ? 'ring-2 ring-inset ring-emerald-300 bg-emerald-400/40'
            : 'ring-2 ring-inset ring-rose-400 bg-rose-500/40'
          : ''
        return (
          <button
            key={index}
            type="button"
            disabled={!interactive}
            aria-label={`${label} ${cellLabel(index)}`}
            data-kind={kind}
            onClick={() => onCellClick?.(index)}
            onMouseEnter={() => onCellEnter?.(index)}
            onMouseLeave={() => onCellLeave?.()}
            className={`aspect-square w-full rounded-[3px] transition-colors duration-150 ${CELL_STYLES[kind]} ${previewStyle} ${
              interactive ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
            }`}
          >
            <span className="sr-only">{kind}</span>
          </button>
        )
      })}
    </>
  )
}
