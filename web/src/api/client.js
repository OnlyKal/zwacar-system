/**
 * Client HTTP de l'API ZwaCar.
 *  - L'access token est conservé en mémoire uniquement (pas de localStorage → limite l'impact d'une XSS).
 *  - Le refresh token est un cookie httpOnly géré par le navigateur.
 *  - Sur 401, une seule tentative de rafraîchissement est lancée et les requêtes en attente sont rejouées.
 */
import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({ baseURL, withCredentials: true, timeout: 60000 })

let accessToken = null
let onSessionExpired = () => {}
export const setAccessToken = (t) => (accessToken = t)
export const getAccessToken = () => accessToken
export const setSessionExpiredHandler = (fn) => (onSessionExpired = fn)

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`
  return cfg
})

let refreshing = null
export function refreshSession() {
  if (!refreshing) {
    refreshing = axios
      .post(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
      .then((r) => {
        setAccessToken(r.data.accessToken)
        return r.data
      })
      .finally(() => setTimeout(() => (refreshing = null), 0))
  }
  return refreshing
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const isAuthCall = original?.url?.includes('/auth/')
    if (status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true
      try {
        await refreshSession()
        return api(original)
      } catch {
        setAccessToken(null)
        onSessionExpired()
      }
    }
    return Promise.reject(error)
  }
)

/** Message d'erreur lisible à partir d'une erreur axios. */
export function errorMessage(err, fallback = 'Une erreur est survenue') {
  const e = err?.response?.data?.error
  if (e?.details?.length) return `${e.message} : ${e.details.map((d) => d.message).join(' · ')}`
  if (e?.message) return e.message
  if (err?.code === 'ECONNABORTED') return 'Délai dépassé, vérifiez votre connexion'
  if (err?.message === 'Network Error') return 'Serveur injoignable'
  return fallback
}

/** Erreurs de validation indexées par champ. */
export function fieldErrors(err) {
  const out = {}
  for (const d of err?.response?.data?.error?.details || []) out[d.field] = d.message
  return out
}

/**
 * Ouvre (affichage / impression) ou télécharge un PDF protégé.
 * Le fichier est récupéré avec le jeton d'accès puis servi via une URL blob.
 */
export async function openPdf(path, { download = false, filename = 'document.pdf' } = {}) {
  const win = download ? null : window.open('', '_blank')
  try {
    const r = await api.get(path, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
    if (download) {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    } else if (win) {
      win.location.href = url
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (e) {
    win?.close()
    // Les erreurs d'un blob doivent être relues en JSON
    if (e.response?.data instanceof Blob) {
      try {
        e.response.data = JSON.parse(await e.response.data.text())
      } catch {
        /* ignore */
      }
    }
    throw e
  }
}

/** Télécharge un fichier binaire quelconque (sauvegardes). */
export async function downloadFile(path, filename) {
  const r = await api.get(path, { responseType: 'blob' })
  const url = URL.createObjectURL(r.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
