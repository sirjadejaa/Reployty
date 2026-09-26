import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  isSuperAdmin: boolean;
}

export interface AuthBusiness {
  id: string;
  name: string;
  category: string;
  role: string;
  isOwner: boolean;
}

export interface AuthMembership {
  businessId: string;
  businessName: string;
  businessSlug: string;
  category: string;
  role: string;
  status: string;
}

interface AuthContextType {
  user: AuthUser | null;
  currentBusiness: AuthBusiness | null;
  memberships: AuthMembership[];
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchBusiness: (businessId: string) => Promise<{ success: boolean; error?: string }>;
  hasPermission: (permissionCode: string) => boolean;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [currentBusiness, setCurrentBusiness] = useState<AuthBusiness | null>(null);
  const [memberships, setMemberships] = useState<AuthMembership[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/auth/me', {
        headers: { 'Accept': 'application/json' },
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setCurrentBusiness(data.currentBusiness);
        setMemberships(data.memberships || []);
        setPermissions(data.permissions || []);
      } else {
        setUser(null);
        setCurrentBusiness(null);
        setMemberships([]);
        setPermissions([]);
      }
    } catch (err: any) {
      setUser(null);
      setCurrentBusiness(null);
      setMemberships([]);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  // Synchronize category theme token cascading with current tenant
  useEffect(() => {
    if (currentBusiness?.category) {
      document.documentElement.setAttribute('data-category-theme', currentBusiness.category.toLowerCase());
    } else {
      document.documentElement.setAttribute('data-category-theme', 'cafe');
    }
  }, [currentBusiness?.category]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setError(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || 'Authentication failed';
        setError(errMsg);
        return { success: false, error: errMsg };
      }

      await refreshAuth();
      return { success: true };
    } catch (err: any) {
      const errMsg = err.message || 'Network error occurred during login';
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setCurrentBusiness(null);
      setMemberships([]);
      setPermissions([]);
      window.location.hash = '';
    }
  };

  const switchBusiness = async (businessId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/switch-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ businessId }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to switch tenant' };
      }

      setCurrentBusiness(data.currentBusiness);
      setPermissions(data.permissions || []);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error switching tenant' };
    }
  };

  const hasPermission = (permissionCode: string): boolean => {
    if (!user) return false;
    if (user.isSuperAdmin || currentBusiness?.isOwner || currentBusiness?.role === 'OWNER') return true;
    return permissions.includes(permissionCode);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        currentBusiness,
        memberships,
        permissions,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        logout,
        switchBusiness,
        hasPermission,
        refreshAuth,
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
