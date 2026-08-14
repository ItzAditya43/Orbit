import { create } from "zustand";

interface Toast {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, opts?: { actionLabel?: string; onAction?: () => void }) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, opts) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, ...opts }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
