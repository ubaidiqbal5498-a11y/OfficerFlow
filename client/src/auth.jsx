import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me()
      .then((data) => setUser(data.user || null))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    isAdmin: user?.role === "admin",
    isBoss: user?.role === "boss",
    async login(username, password) {
      const data = await api.login({ username, password });
      setUser(data.user);
      return data.user;
    },
    async logout() {
      try {
        await api.logout();
      } finally {
        setUser(null);
      }
    },
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
