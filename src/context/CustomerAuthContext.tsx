import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  CustomerProfile,
  PublicBusinessContext,
  PublicBranchContext,
  CustomerConsentItem,
  CustomerActivityItem,
  CustomerLoyaltyState,
  PublicQrResolution,
} from '../types/customer';

export function getCustomerSessionForBusiness(businessId?: string): string | null {
  if (typeof window === 'undefined' || !businessId) return null;
  try {
    return localStorage.getItem(`reployty_customer_session_${businessId}`) || null;
  } catch {
    return null;
  }
}

export function setCustomerSessionForBusiness(businessId: string, token: string): void {
  if (typeof window === 'undefined' || !businessId) return;
  try {
    localStorage.setItem(`reployty_customer_session_${businessId}`, token);
  } catch {
    // Ignore quota / access errors
  }
}

export function removeCustomerSessionForBusiness(businessId: string): void {
  if (typeof window === 'undefined' || !businessId) return;
  try {
    localStorage.removeItem(`reployty_customer_session_${businessId}`);
  } catch {
    // Ignore
  }
}

interface CustomerAuthContextType {
  customer: CustomerProfile | null;
  business: PublicBusinessContext | null;
  branch: PublicBranchContext | null;
  consents: CustomerConsentItem[];
  activity: CustomerActivityItem[];
  loyaltyState: CustomerLoyaltyState | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  activeQrResolution: PublicQrResolution | null;
  activeQrToken: string | null;
  getSessionToken: (businessId?: string) => string | null;
  resolveQr: (code: string) => Promise<PublicQrResolution>;
  requestOtp: (businessId: string, phone: string) => Promise<{ challengeId: string; expiresInSeconds: number; devOtp?: string }>;
  verifyOtp: (params: {
    businessId: string;
    phone: string;
    code: string;
    challengeId?: string;
    name?: string;
    email?: string;
    birthday?: string;
    marketingConsent?: boolean;
    branchId?: string;
  }) => Promise<{ customer: CustomerProfile; isNew: boolean }>;
  updateProfile: (data: { name?: string; email?: string; birthday?: string }) => Promise<void>;
  updateConsent: (channel: string, granted: boolean) => Promise<void>;
  refreshProfile: (targetQrToken?: string, targetBusinessId?: string) => Promise<void>;
  refreshActivity: () => Promise<void>;
  logout: (targetBusinessId?: string) => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export const CustomerAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [business, setBusiness] = useState<PublicBusinessContext | null>(null);
  const [branch, setBranch] = useState<PublicBranchContext | null>(null);
  const [consents, setConsents] = useState<CustomerConsentItem[]>([]);
  const [activity, setActivity] = useState<CustomerActivityItem[]>([]);
  const [loyaltyState, setLoyaltyState] = useState<CustomerLoyaltyState | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeQrResolution, setActiveQrResolution] = useState<PublicQrResolution | null>(null);
  const [activeQrToken, setActiveQrToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash.replace(/^#\/?/, '');
      const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
      const qrFromUrl = hashParams.get('qr') || searchParams.get('qr');
      if (qrFromUrl) return qrFromUrl;
      if (hash.startsWith('join/')) return hash.replace('join/', '').split('?')[0];
      return sessionStorage.getItem('reployty_active_qr') || null;
    } catch {
      return null;
    }
  });

  const getSessionToken = useCallback((bId?: string) => {
    const target = bId || business?.id || activeQrResolution?.business?.id;
    return getCustomerSessionForBusiness(target);
  }, [business?.id, activeQrResolution?.business?.id]);

  const refreshProfile = useCallback(async (targetQrToken?: string, targetBusinessId?: string) => {
    const qr = targetQrToken || activeQrToken || '';
    const bId = targetBusinessId || business?.id || activeQrResolution?.business?.id;
    const sessionToken = bId ? getCustomerSessionForBusiness(bId) : null;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    if (qr) {
      headers['x-reployty-qr'] = qr;
    }

    const url = qr ? `/api/customer/me?qr=${encodeURIComponent(qr)}` : '/api/customer/me';

    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.isAuthenticated && data.customer) {
          setCustomer(data.customer);
          setBusiness(data.business);
          setBranch(data.branch || null);
          setConsents(data.consents || []);
          setLoyaltyState(data.loyaltyState || null);
          setIsAuthenticated(true);
        } else {
          setCustomer(null);
          if (data.business) setBusiness(data.business);
          if (data.branch) setBranch(data.branch);
          setConsents([]);
          setLoyaltyState(data.loyaltyState || null);
          setIsAuthenticated(false);
        }
      } else {
        setCustomer(null);
        setIsAuthenticated(false);
      }
    } catch {
      setCustomer(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, [activeQrToken, business?.id, activeQrResolution?.business?.id]);

  const refreshActivity = useCallback(async () => {
    const bId = business?.id || activeQrResolution?.business?.id;
    const sessionToken = bId ? getCustomerSessionForBusiness(bId) : null;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

    try {
      const res = await fetch('/api/customer/activity', { headers });
      if (res.ok) {
        const data = await res.json();
        setActivity(data);
      }
    } catch {
      // Ignore
    }
  }, [business?.id, activeQrResolution?.business?.id]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const resolveQr = useCallback(async (code: string): Promise<PublicQrResolution> => {
    setActiveQrToken(code);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('reployty_active_qr', code);
      } catch {}
    }
    const res = await fetch(`/api/customer/qr/${encodeURIComponent(code)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to resolve QR code' }));
      throw new Error(err.error || 'Invalid QR code');
    }
    const data: PublicQrResolution = await res.json();
    setActiveQrResolution(data);
    setBusiness(data.business);
    setBranch(data.branch);

    // Check if customer has an existing session for this specific business
    const sessionToken = getCustomerSessionForBusiness(data.business.id);
    if (sessionToken) {
      await refreshProfile(code, data.business.id);
    } else {
      setCustomer(null);
      setConsents([]);
      setActivity([]);
      setLoyaltyState(null);
      setIsAuthenticated(false);
    }

    return data;
  }, [refreshProfile]);

  const requestOtp = useCallback(async (businessId: string, phone: string) => {
    const res = await fetch('/api/customer/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, phone }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to send verification code');
    }
    return data;
  }, []);

  const verifyOtp = useCallback(async (params: {
    businessId: string;
    phone: string;
    code: string;
    challengeId?: string;
    name?: string;
    email?: string;
    birthday?: string;
    marketingConsent?: boolean;
    branchId?: string;
  }) => {
    const res = await fetch('/api/customer/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Verification failed');
    }

    if (data.sessionToken) {
      setCustomerSessionForBusiness(params.businessId, data.sessionToken);
    }

    await refreshProfile(activeQrToken || undefined, params.businessId);
    return { customer: data.customer, isNew: data.isNew };
  }, [activeQrToken, refreshProfile]);

  const updateProfile = useCallback(async (data: { name?: string; email?: string; birthday?: string }) => {
    const bId = business?.id || activeQrResolution?.business?.id;
    const sessionToken = bId ? getCustomerSessionForBusiness(bId) : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

    const res = await fetch('/api/customer/profile', {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to update profile');
    }
    await refreshProfile(activeQrToken || undefined, bId);
  }, [activeQrToken, business?.id, activeQrResolution?.business?.id, refreshProfile]);

  const updateConsent = useCallback(async (channel: string, granted: boolean) => {
    const bId = business?.id || activeQrResolution?.business?.id;
    const sessionToken = bId ? getCustomerSessionForBusiness(bId) : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

    const res = await fetch('/api/customer/consent', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ channel, granted }),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to update consent preferences');
    }
    await refreshProfile(activeQrToken || undefined, bId);
  }, [activeQrToken, business?.id, activeQrResolution?.business?.id, refreshProfile]);

  const logout = useCallback(async (targetBusinessId?: string) => {
    const bId = targetBusinessId || business?.id || activeQrResolution?.business?.id;
    const sessionToken = bId ? getCustomerSessionForBusiness(bId) : null;

    try {
      const headers: Record<string, string> = {};
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
      await fetch('/api/customer/auth/logout', { method: 'POST', headers });
    } catch {
      // Ignore network errors on logout
    }

    if (bId) {
      removeCustomerSessionForBusiness(bId);
    }

    setCustomer(null);
    setIsAuthenticated(false);
    setLoyaltyState(null);
    setActivity([]);
  }, [business?.id, activeQrResolution?.business?.id]);

  const contextValue = React.useMemo(() => ({
    customer,
    business,
    branch,
    consents,
    activity,
    loyaltyState,
    isAuthenticated,
    isLoading,
    activeQrResolution,
    activeQrToken,
    getSessionToken,
    resolveQr,
    requestOtp,
    verifyOtp,
    updateProfile,
    updateConsent,
    refreshProfile,
    refreshActivity,
    logout,
  }), [
    customer,
    business,
    branch,
    consents,
    activity,
    loyaltyState,
    isAuthenticated,
    isLoading,
    activeQrResolution,
    activeQrToken,
    getSessionToken,
    resolveQr,
    requestOtp,
    verifyOtp,
    updateProfile,
    updateConsent,
    refreshProfile,
    refreshActivity,
    logout,
  ]);

  return (
    <CustomerAuthContext.Provider value={contextValue}>
      {children}
    </CustomerAuthContext.Provider>
  );
};

export const useCustomerAuth = () => {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
};
