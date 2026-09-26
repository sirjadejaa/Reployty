import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantProvider } from './context/TenantContext';
import { ToastProvider } from './context/ToastContext';
import { AppShell } from './components/layout/AppShell';
import { DashboardView } from './views/DashboardView';
import { DesignSystemView } from './views/DesignSystemView';
import { CustomerPreviewView } from './views/CustomerPreviewView';
import { PlaceholderView } from './views/PlaceholderView';
import { LoginView } from './views/LoginView';
import { ForgotPasswordView } from './views/ForgotPasswordView';
import { AdminRoute } from './types/loyalty';
import { SuperAdminRoute } from './types/admin';
import { AdminAppShell } from './components/admin/AdminAppShell';
import { AdminOverviewView } from './views/admin/AdminOverviewView';
import { AdminBusinessesView } from './views/admin/AdminBusinessesView';
import { AdminBusinessDetailView } from './views/admin/AdminBusinessDetailView';
import { AdminUsersView } from './views/admin/AdminUsersView';
import { AdminStaffView } from './views/admin/AdminStaffView';
import { AdminRolesView } from './views/admin/AdminRolesView';
import { AdminAuditLogsView } from './views/admin/AdminAuditLogsView';
import { AdminAnalyticsView } from './views/admin/AdminAnalyticsView';
import { OnboardingView } from './views/OnboardingView';
import { BusinessProfileView } from './views/settings/BusinessProfileView';
import { BranchesView } from './views/settings/BranchesView';
import { StaffManagementView } from './views/settings/StaffManagementView';
import { BrandingView } from './views/settings/BrandingView';
import { BusinessSettingsView } from './views/settings/BusinessSettingsView';
import { CustomerPwaView } from './views/customer/CustomerPwaView';
import { BusinessLoyaltyView } from './views/business/BusinessLoyaltyView';
import { BusinessRewardsView } from './views/business/BusinessRewardsView';
import { BusinessCustomersView } from './views/business/BusinessCustomersView';
import { BusinessCatalogView } from './views/business/BusinessCatalogView';
import { BusinessOffersView } from './views/business/BusinessOffersView';
import { BusinessReviewsView } from './views/business/BusinessReviewsView';
import { BusinessAnalyticsView } from './views/business/BusinessAnalyticsView';
import { BusinessBillingView } from './views/business/BusinessBillingView';
import { AdminPlansView } from './views/admin/AdminPlansView';
import { AdminBillingView } from './views/admin/AdminBillingView';
import { Button } from './components/ui/Button';
import { Award, Shield, AlertTriangle } from 'lucide-react';

export type AppRoute = AdminRoute | SuperAdminRoute;

export const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('dashboard');
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [authView, setAuthView] = useState<'login' | 'forgot-password'>('login');
  const [customerRoute, setCustomerRoute] = useState<{
    isCustomer: boolean;
    qrToken: string;
    tab: 'home' | 'loyalty' | 'rewards' | 'activity' | 'profile';
  }>({
    isCustomer: false,
    qrToken: 'bean-stand-01',
    tab: 'home',
  });

  // Synchronize with URL hash if present
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#', '');
      const [routePart, queryPart] = rawHash.split('?');

      // Check Customer PWA routes (strictly separate from business CRM 'customers' and 'business-customers')
      const isCustomerRoute =
        rawHash.startsWith('join') ||
        rawHash === 'customer' ||
        rawHash.startsWith('customer/') ||
        rawHash.startsWith('customer?');

      if (isCustomerRoute) {
        let token = 'bean-stand-01';
        let tab: 'home' | 'loyalty' | 'rewards' | 'activity' | 'profile' = 'home';
        if (rawHash.startsWith('join/')) {
          token = rawHash.replace('join/', '').split('?')[0] || 'bean-stand-01';
        } else if (rawHash === 'customer/loyalty') {
          tab = 'loyalty';
        } else if (rawHash === 'customer/rewards') {
          tab = 'rewards';
        } else if (rawHash === 'customer/activity') {
          tab = 'activity';
        } else if (rawHash === 'customer/profile') {
          tab = 'profile';
        }
        setCustomerRoute({ isCustomer: true, qrToken: token, tab });
        return;
      } else {
        setCustomerRoute(prev => (prev.isCustomer ? { ...prev, isCustomer: false } : prev));
      }

      const hash = routePart as AppRoute;

      // Extract ID query param if present
      if (queryPart) {
        const searchParams = new URLSearchParams(queryPart);
        const id = searchParams.get('id');
        if (id) {
          setSelectedBusinessId(id);
        }
      }

      const validTenantRoutes: AdminRoute[] = [
        'dashboard',
        'customers',
        'business-customers',
        'loyalty',
        'rewards',
        'offers',
        'menu',
        'reviews',
        'campaigns',
        'analytics',
        'staff',
        'settings',
        'onboarding',
        'settings-business',
        'settings-branches',
        'branches',
        'settings-staff',
        'settings-branding',
        'design-system',
        'customer-preview',
      ];

      const validSuperAdminRoutes: SuperAdminRoute[] = [
        'admin-overview',
        'admin-businesses',
        'admin-business-detail',
        'admin-users',
        'admin-staff',
        'admin-roles',
        'admin-audit-logs',
        'admin-analytics',
      ];

      if (hash && (validTenantRoutes.includes(hash as AdminRoute) || validSuperAdminRoutes.includes(hash as SuperAdminRoute))) {
        setCurrentRoute(hash);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleRouteChange = (route: AppRoute, params?: { id?: string }) => {
    if (params?.id) {
      setSelectedBusinessId(params.id);
      window.location.hash = `${route}?id=${params.id}`;
    } else {
      window.location.hash = route;
    }
    setCurrentRoute(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1. Session Loading Splash Screen
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-bg-canvas)',
          gap: 'var(--space-4)',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-xl)',
            backgroundColor: 'var(--color-primary)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-primary-glow)',
            animation: 'pulse 1.8s infinite',
          }}
        >
          <Award size={26} strokeWidth={2.5} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)', color: 'var(--color-text-primary)' }}>
            Reployty
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Verifying secure session...
          </div>
        </div>
      </div>
    );
  }

  // 2. Customer PWA Experience (Isolated from business staff authentication)
  if (customerRoute.isCustomer) {
    return (
      <CustomerPwaView
        initialQrToken={customerRoute.qrToken}
        initialTab={customerRoute.tab}
      />
    );
  }

  // 3. Business Staff Unauthenticated Gate
  if (!isAuthenticated) {
    if (authView === 'forgot-password') {
      return <ForgotPasswordView onBackToLogin={() => setAuthView('login')} />;
    }
    return <LoginView onNavigateForgotPassword={() => setAuthView('forgot-password')} />;
  }

  // 3. Super Admin Route Gate & Rendering
  const isSuperAdminRoute = (currentRoute as string).startsWith('admin-');

  if (isSuperAdminRoute) {
    // Non-SuperAdmin trying to access super admin routes
    if (!user?.isSuperAdmin) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--color-bg-canvas)',
            padding: 'var(--space-6)',
          }}
        >
          <div
            style={{
              maxWidth: 440,
              width: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              padding: '36px 32px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                backgroundColor: '#EEF2FF',
                color: '#4F6BFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Shield size={24} strokeWidth={2.2} />
            </div>
            <h2
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: '#0F172A',
                marginBottom: '8px',
                letterSpacing: '-0.02em',
              }}
            >
              Access restricted
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: '#64748B',
                marginBottom: '24px',
                lineHeight: 1.5,
              }}
            >
              This area is available to Reployty platform administrators.
            </p>
            <Button
              variant="primary"
              style={{ width: '100%', height: 42 }}
              onClick={() => handleRouteChange('dashboard')}
            >
              Return to your workspace
            </Button>
          </div>
        </div>
      );
    }

    // Authenticated Super Admin Views
    const renderSuperAdminView = () => {
      switch (currentRoute) {
        case 'admin-overview':
          return <AdminOverviewView onNavigate={handleRouteChange as any} />;
        case 'admin-businesses':
          return <AdminBusinessesView onNavigate={handleRouteChange as any} />;
        case 'admin-business-detail':
          if (!selectedBusinessId) {
            return (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
                <AlertTriangle size={36} color="var(--color-warning)" style={{ marginBottom: 'var(--space-3)' }} />
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>No Business Selected</h3>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                  Please select a business from the business management directory.
                </p>
                <Button variant="primary" onClick={() => handleRouteChange('admin-businesses')}>
                  Go to Business Directory
                </Button>
              </div>
            );
          }
          return (
            <AdminBusinessDetailView
              businessId={selectedBusinessId}
              onNavigate={handleRouteChange as any}
            />
          );
        case 'admin-users':
          return <AdminUsersView onNavigate={handleRouteChange as any} />;
        case 'admin-staff':
          return <AdminStaffView onNavigate={handleRouteChange as any} />;
        case 'admin-roles':
          return <AdminRolesView onNavigate={handleRouteChange as any} />;
        case 'admin-audit-logs':
          return <AdminAuditLogsView onNavigate={handleRouteChange as any} />;
        case 'admin-analytics':
          return <AdminAnalyticsView onNavigate={handleRouteChange as any} />;
        case 'admin-plans':
          return <AdminPlansView />;
        case 'admin-billing':
          return <AdminBillingView />;
        default:
          return <AdminOverviewView onNavigate={handleRouteChange as any} />;
      }
    };

    return (
      <AdminAppShell
        currentRoute={currentRoute as SuperAdminRoute}
        onRouteChange={(route) => handleRouteChange(route)}
      >
        {renderSuperAdminView()}
      </AdminAppShell>
    );
  }

  // 4. Authenticated Business Tenant App Views
  const renderTenantView = () => {
    switch (currentRoute) {
      case 'dashboard':
        return <DashboardView onNavigate={handleRouteChange as any} />;
      case 'customers':
      case 'business-customers':
        return <BusinessCustomersView onNavigate={handleRouteChange as any} />;
      case 'onboarding':
        return <OnboardingView onNavigate={handleRouteChange as any} />;
      case 'settings':
        return <BusinessSettingsView onNavigate={handleRouteChange as any} />;
      case 'settings-business':
        return <BusinessProfileView onNavigate={handleRouteChange as any} />;
      case 'settings-branches':
      case 'branches':
        return <BranchesView onNavigate={handleRouteChange as any} />;
      case 'settings-staff':
      case 'staff':
        return <StaffManagementView onNavigate={handleRouteChange as any} />;
      case 'settings-branding':
        return <BrandingView onNavigate={handleRouteChange as any} />;
      case 'billing':
        return <BusinessBillingView onNavigate={handleRouteChange as any} />;
      case 'loyalty':
        return <BusinessLoyaltyView />;
      case 'rewards':
        return <BusinessRewardsView />;
      case 'offers':
        return <BusinessOffersView onNavigate={handleRouteChange as any} />;
      case 'menu':
        return <BusinessCatalogView onNavigate={handleRouteChange as any} />;
      case 'reviews':
        return <BusinessReviewsView />;
      case 'analytics':
        return <BusinessAnalyticsView onNavigate={handleRouteChange as any} />;
      case 'design-system':
        return <DesignSystemView />;
      case 'customer-preview':
        return <CustomerPreviewView />;
      default:
        return (
          <PlaceholderView
            route={currentRoute as AdminRoute}
            onNavigateHome={() => handleRouteChange('dashboard')}
          />
        );
    }
  };

  return (
    <AppShell currentRoute={currentRoute as AdminRoute} onRouteChange={handleRouteChange as any}>
      {renderTenantView()}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <TenantProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </TenantProvider>
    </AuthProvider>
  );
};

export default App;
