import { create } from "zustand";

interface TrainingState {
  noteDrafts: Record<number, string>;
  setNoteDraft: (sessionId: number, value: string) => void;
  clearSession: (sessionId: number) => void;
}

export const useTrainingStore = create<TrainingState>((set) => ({
  noteDrafts: {},
  setNoteDraft: (sessionId, value) => set((state) => ({ noteDrafts: { ...state.noteDrafts, [sessionId]: value } })),
  clearSession: (sessionId) => set((state) => {
    const next = { ...state.noteDrafts };
    delete next[sessionId];
    return { noteDrafts: next };
  }),
}));

