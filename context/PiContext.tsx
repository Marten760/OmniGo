import { createContext, useContext, ReactNode } from 'react';
import { usePi as usePiInternal } from '../hooks/usePi';

// The return type of the internal hook
type PiHookType = ReturnType<typeof usePiInternal>;

const PiContext = createContext<PiHookType | undefined>(undefined);

export function PiProvider({ children }: { children: ReactNode }) {
  const pi = usePiInternal(); // The hook is called once here
  return <PiContext.Provider value={pi}>{children}</PiContext.Provider>;
}

export function usePi() {
  const context = useContext(PiContext);
  if (!context) throw new Error('usePi must be used within a PiProvider');
  return context;
}