import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  // Restauration de session au chargement via le cookie de rafraîchissement.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))
    refreshSession()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password, scope: 'backoffice' })
    setAccessToken(data.accessToken)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const reloadUser = useCallback(async () => {
    const { data } = await api.get('/auth/me')
    setUser(data.user)
    return data.user
  }, [])

  const value = useMemo(
    () => ({
      user,
      ready,
      login,
      logout,
      reloadUser,
      setUser,
      isSuperAdmin: user?.role === 'super_admin',
      can: (perm) => user?.role === 'super_admin' || Boolean(user?.permissions?.includes(perm)),
      home: user?.role === 'super_admin' ? '/admin' : '/company',
    }),
    [user, ready, login, logout, reloadUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
