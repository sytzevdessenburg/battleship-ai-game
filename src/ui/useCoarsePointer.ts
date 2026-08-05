import { useEffect, useState } from 'react'

const COARSE_POINTER = '(pointer: coarse)'

function pointerQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(COARSE_POINTER)
}

/** True on touch devices, where hover is unavailable and placement needs two taps. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => pointerQuery()?.matches ?? false)

  useEffect(() => {
    const query = pointerQuery()
    if (!query) return
    setCoarse(query.matches)
    const update = (event: MediaQueryListEvent) => setCoarse(event.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return coarse
}
