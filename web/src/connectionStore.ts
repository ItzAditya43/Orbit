import { create } from "zustand";

interface ConnectionState {
  isConnected: boolean;
  lastCheckedAt: number | null;
  setConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  isConnected: true,
  lastCheckedAt: null,
  setConnected: (connected) => {
    if (get().isConnected !== connected) set({ isConnected: connected, lastCheckedAt: Date.now() });
    else set({ lastCheckedAt: Date.now() });
  },
}));
