import { createContext, useContext } from 'react'

/** Signing out, as the frame does it: an open form with unsaved edits asks first. */
export const SignOutContext = createContext<() => void>(() => {})

export const useSignOut = () => useContext(SignOutContext)
