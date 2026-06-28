import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/db';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Erase any legacy localStorage session so login doesn't survive browser restart
    localStorage.removeItem('kiddorin_user');
    
    // 2. Load session strictly from sessionStorage (cleared automatically when browser closes)
    const storedUser = sessionStorage.getItem('kiddorin_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        sessionStorage.removeItem('kiddorin_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      const userData = await db.login(username, password);
      setUser(userData);
      // Store session in sessionStorage
      sessionStorage.setItem('kiddorin_user', JSON.stringify(userData));
      // Remove any lingering localStorage items
      localStorage.removeItem('kiddorin_user');
      return { success: true, userData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Error signing out of Supabase:", e);
    }
    setUser(null);
    sessionStorage.removeItem('kiddorin_user');
    localStorage.removeItem('kiddorin_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
