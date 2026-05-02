import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query. Returns whether the query currently matches.
 *
 * Used to make UI more compact on phones (panels collapsed by default, etc).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    function handler(e: MediaQueryListEvent): void {
      setMatches(e.matches)
    }
    mql.addEventListener('change', handler)
    return () => {
      mql.removeEventListener('change', handler)
    }
  }, [query])

  return matches
}

export const MOBILE_QUERY = '(max-width: 768px)'
