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
  refreshProfile: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  logout: () => Promise<void>;
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

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/me', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setCustomer(data.customer);
        setBusiness(data.business);
        setConsents(data.consents || []);
        setLoyaltyState(data.loyaltyState || null);
        setIsAuthenticated(true);
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
  }, []);

  const refreshActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/activity', {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setActivity(data);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const resolveQr = async (code: string): Promise<PublicQrResolution> => {
    const res = await fetch(`/api/customer/qr/${encodeURIComponent(code)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to resolve QR code' }));
      throw new Error(err.error || 'Invalid QR code');
    }
    const data: PublicQrResolution = await res.json();
    setActiveQrResolution(data);
    setBusiness(data.business);
    setBranch(data.branch);
    return data;
  };

  const requestOtp = async (businessId: string, phone: string) => {
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
  };

  const verifyOtp = async (params: {
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
    await refreshProfile();
    return { customer: data.customer, isNew: data.isNew };
  };

  const updateProfile = async (data: { name?: string; email?: string; birthday?: string }) => {
    const res = await fetch('/api/customer/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to update profile');
    }
    await refreshProfile();
  };

  const updateConsent = async (channel: string, granted: boolean) => {
    const res = await fetch('/api/customer/consent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, granted }),
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Failed to update consent preferences');
    }
    await refreshProfile();
  };

  const logout = async () => {
    try {
      await fetch('/api/customer/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setCustomer(null);
    setIsAuthenticated(false);
    setActivity([]);
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        business,
        branch,
        consents,
        activity,
        loyaltyState,
        isAuthenticated,
        isLoading,
        activeQrResolution,
        resolveQr,
        requestOtp,
        verifyOtp,
        updateProfile,
        updateConsent,
        refreshProfile,
        refreshActivity,
        logout,
      }}
    >
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
