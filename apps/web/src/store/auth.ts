import { create } from 'zustand'
import type { User } from '../lib/types'
import { clearStoredToken, getStoredToken, storeToken } from '../lib/api'

interface AuthState {
  token: string | null
  user: User | null
  loading: boolean
  setSession: (token: string, user: User) => void
  setUser: (user: User | null) => void
  clear: () => void
}

export const useAuth = create<AuthState>((set) => ({
  token: getStoredToken(),
  user: null,
  loading: true,
  setSession: (token, user) => {
    storeToken(token)
    set({ token, user, loading: false })
  },
  setUser: (user) => set({ user, loading: false }),
  clear: () => {
    clearStoredToken()
    set({ token: null, user: null, loading: false })
  },
}))
