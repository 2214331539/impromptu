import { create } from "zustand";
import type { AuthResponse, User } from "../types";

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (response: AuthResponse) => void;
  logout: () => void;
}

const storedToken = localStorage.getItem("speaking-lab-token");
const storedUser = localStorage.getItem("speaking-lab-user");

export const useAuthStore = create<AuthState>((set) => ({
  token: storedToken,
  user: storedUser ? JSON.parse(storedUser) as User : null,
  setAuth: (response) => {
    localStorage.setItem("speaking-lab-token", response.access_token);
    localStorage.setItem("speaking-lab-user", JSON.stringify(response.user));
    set({ token: response.access_token, user: response.user });
  },
  logout: () => {
    localStorage.removeItem("speaking-lab-token");
    localStorage.removeItem("speaking-lab-user");
    set({ token: null, user: null });
  },
}));

