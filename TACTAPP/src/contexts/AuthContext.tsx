import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { apiClient } from '../services/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, rememberMe: boolean) => Promise<boolean>;
  register: (userData: Omit<User, 'id' | 'role'>) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateProfile: (data: { phone?: string; whatsapp?: string; line?: string }) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // true เพื่อเช็ค token ตอนเปิดแอป

  // ตรวจสอบ token ตอนเปิดแอป (auto-login)
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await apiClient.getMe();

        if (response.success && response.data?.user) {
          const u = response.data.user;
          setUser({
            id: u.id,
            username: u.username,
            email: u.email,
            password: '',
            phone: u.phone || '',
            whatsapp: u.whatsapp || '',
            line: u.line || '',
            role: u.role as 'Admin' | 'User',
            rememberMe: false,
          });
        }
      } catch (error) {
        console.error('Auto-login check error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string, rememberMe: boolean): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await apiClient.login({ username, password });

      if (response.success && response.data) {
        // เก็บ token
        await apiClient.setToken(response.data.token);

        // Set user data
        const u = response.data.user;
        setUser({
          id: u.id,
          username: u.username,
          email: u.email,
          password: '',
          phone: u.phone || '',
          whatsapp: u.whatsapp || '',
          line: u.line || '',
          role: u.role as 'Admin' | 'User',
          rememberMe,
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: Omit<User, 'id' | 'role'>): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      const response = await apiClient.register({
        username: userData.username,
        email: userData.email,
        phone: userData.phone,
        password: userData.password,
        whatsapp: userData.whatsapp,
        line: userData.line,
      });

      if (response.success && response.data) {
        await apiClient.setToken(response.data.token);

        const u = response.data.user;
        setUser({
          id: u.id,
          username: u.username,
          email: u.email,
          password: '',
          phone: u.phone || '',
          whatsapp: u.whatsapp || '',
          line: u.line || '',
          role: u.role as 'Admin' | 'User',
          rememberMe: false,
        });

        return { success: true };
      }

      return {
        success: false,
        message: response.message || 'Registration failed',
      };
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, message: 'Network error' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await apiClient.logout();
    setUser(null);
  };

  const updateProfile = async (data: { phone?: string; whatsapp?: string; line?: string }): Promise<boolean> => {
    try {
      const response = await apiClient.updateProfile(data);

      if (response.success && response.data?.user) {
        const u = response.data.user;
        setUser(prev => prev ? {
          ...prev,
          phone: u.phone || prev.phone,
          whatsapp: u.whatsapp || prev.whatsapp,
          line: u.line || prev.line,
        } : null);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Update profile error:', error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};