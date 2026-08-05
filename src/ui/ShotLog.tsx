import type { LogEntry } from '../game/state'
import { cellLabel } from './cells'

const RESULT_STYLES: Record<LogEntry['result'], string> = {
  miss: 'text-sky-300/70',
  hit: 'text-amber-300',
  sunk: 'text-rose-300',
}

function describe(entry: LogEntry): string {
  if (entry.result === 'sunk') return `sunk the ${entry.shipId}`
  return entry.result
}

export function ShotLog({ log }: { log: LogEntry[] }) {
  return (
    <section
      aria-label="Shot log"
      className="flex h-full min-h-40 flex-col rounded-xl border border-sky-800/60 bg-sky-950/60 p-3"
    >
      <h2 className="mb-2 text-xs font-semibold tracking-[0.2em] text-sky-300/80 uppercase">
        Shot log
      </h2>
      {log.length === 0 ? (
        <p className="text-sm text-sky-400/60">No shots fired yet.</p>
      ) : (
        <ol className="flex max-h-64 flex-col-reverse gap-1 overflow-y-auto text-sm">
          {log.map((entry, position) => (
            <li
              key={`${entry.side}-${entry.index}-${position}`}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="text-sky-100">
                <span className="text-sky-400/80">{position + 1}.</span>{' '}
                {entry.side === 'player' ? 'You' : 'AI'} → {cellLabel(entry.index)}
              </span>
              <span className={`font-medium ${RESULT_STYLES[entry.result]}`}>
                {describe(entry)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
