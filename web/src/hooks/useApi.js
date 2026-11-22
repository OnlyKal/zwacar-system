import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '../api/client'

/**
 * Charge une ressource de l'API et expose { data, loading, error, reload }.
 * `params` est sérialisé pour déclencher un rechargement lorsqu'il change.
 */
export function useApi(url, params, { enabled = true, keepPrevious = true } = {}) {
  const [state, setState] = useState({ data: null, loading: Boolean(url && enabled), error: null })
  const key = JSON.stringify(params || {})
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!url || !enabled) return
    const id = ++seq.current
    setState((s) => ({ data: keepPrevious ? s.data : null, loading: true, error: null }))
    try {
      const clean = Object.fromEntries(Object.entries(JSON.parse(key)).filter(([k, v]) => !k.startsWith('_') && v !== '' && v !== null && v !== undefined))
      const r = await api.get(url, { params: clean })
      if (id === seq.current) setState({ data: r.data, loading: false, error: null })
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error: errorMessage(e) }))
    }
  }, [url, key, enabled, keepPrevious])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load }
}

export function useDebounce(value, delay = 350) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}
