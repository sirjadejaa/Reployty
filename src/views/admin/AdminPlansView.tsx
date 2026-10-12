import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit2,
  AlertTriangle,
  RefreshCw,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
  Trash2,
  Building2,
  ArrowRight,
  Power,
  Users,
  Store,
  UserCheck,
  Gift,
  Tag,
  Zap,
} from 'lucide-react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../context/ToastContext';

export interface AdminPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMinor: number;
  yearlyPriceMinor: number | null;
  currency: string;
  billingInterval: string;
  features: string[];
  limits: Record<string, number | null> | null;
  maxCustomers: number;
  maxBranches: number;
  maxStaff: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    subscriptions: number;
  };
}

export interface PlatformFeature {
  key: string;
  label: string;
  category: 'CORE' | 'ENGAGEMENT' | 'COMMUNICATION' | 'MANAGEMENT' | 'ENTERPRISE';
  description: string;
  isCore: boolean;
}

interface PlatformBusinessOption {
  id: string;
  name: string;
  slug: string;
  status: string;
  subscription?: {
    id: string;
    status: string;
    billingInterval: string;
    plan?: {
      id: string;
      name: string;
    };
  } | null;
}

export const AdminPlansView: React.FC = () => {
  const { addToast } = useToast();
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [platformFeatures, setPlatformFeatures] = useState<PlatformFeature[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Catalogue Filtering State
  const [showInactive, setShowInactive] = useState<boolean>(false);

  // Edit / Create Plan Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form inputs
  const [name, setName] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [monthlyPrice, setMonthlyPrice] = useState<number>(0);
  const [yearlyPrice, setYearlyPrice] = useState<number>(0);
  const [maxCustomers, setMaxCustomers] = useState<number>(1000);
  const [maxBranches, setMaxBranches] = useState<number>(1);
  const [maxStaff, setMaxStaff] = useState<number>(5);
  const [maxRewards, setMaxRewards] = useState<number>(10);
  const [maxOffers, setMaxOffers] = useState<number>(5);
  const [monthlyAiDrafts, setMonthlyAiDrafts] = useState<number>(50);
  const [maxActiveCampaigns, setMaxActiveCampaigns] = useState<number>(5);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');

  // Delete Plan Modal State
  const [planToDelete, setPlanToDelete] = useState<AdminPlan | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [reassignSubscribersToFree, setReassignSubscribersToFree] = useState<boolean>(false);

  // Bulk Cleanup Modal State
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState<boolean>(false);
  const [cleanupPreview, setCleanupPreview] = useState<any | null>(null);
  const [isLoadingCleanupPreview, setIsLoadingCleanupPreview] = useState<boolean>(false);
  const [isExecutingCleanup, setIsExecutingCleanup] = useState<boolean>(false);

  // Assign Plan Modal State
  const [planToAssign, setPlanToAssign] = useState<AdminPlan | null>(null);
  const [businesses, setBusinesses] = useState<PlatformBusinessOption[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [assignInterval, setAssignInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState<boolean>(false);
  const [isAssigning, setIsAssigning] = useState<boolean>(false);
  const [businessSearch, setBusinessSearch] = useState<string>('');

  const fetchPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const url = `/api/admin/plans${showInactive ? '?includeInactive=true' : ''}`;
      const [plansRes, featuresRes] = await Promise.all([
        fetch(url, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        }),
        fetch('/api/admin/features', {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        }),
      ]);

      if (!plansRes.ok) throw new Error('Failed to fetch platform subscription plans');
      const data: AdminPlan[] = await plansRes.json();
      setPlans(data);

      if (featuresRes.ok) {
        const featJson = await featuresRes.json();
        setPlatformFeatures(featJson.features || featJson.items || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading plans');
      addToast({ type: 'error', title: err.message || 'Error loading plans' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [showInactive]);

  const handleOpenCleanupModal = async () => {
    setIsCleanupModalOpen(true);
    setCleanupPreview(null);
    try {
      setIsLoadingCleanupPreview(true);
      const res = await fetch('/api/admin/plans/cleanup/preview', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to fetch cleanup preview');
      }
      const data = await res.json();
      setCleanupPreview(data);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Cleanup Preview Failed', message: err.message });
      setIsCleanupModalOpen(false);
    } finally {
      setIsLoadingCleanupPreview(false);
    }
  };

  const handleExecuteCleanup = async () => {
    try {
      setIsExecutingCleanup(true);
      const res = await fetch('/api/admin/plans/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Cleanup execution failed');
      }
      addToast({
        type: 'success',
        title: 'Package Catalogue Cleaned Up',
        message: data.message || `Cleaned up ${data.deletedPlansCount} packages. Subscribed businesses reassigned to Free Starter.`,
      });
      setIsCleanupModalOpen(false);
      await fetchPlans();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Cleanup Failed', message: err.message });
    } finally {
      setIsExecutingCleanup(false);
    }
  };

  const openCreateModal = () => {
    setEditingPlan(null);
    setName('');
    setSlug('');
    setDescription('');
    setMonthlyPrice(0);
    setYearlyPrice(0);
    setMaxCustomers(1000);
    setMaxBranches(1);
    setMaxStaff(5);
    setMaxRewards(10);
    setMaxOffers(5);
    setMonthlyAiDrafts(50);
    setMaxActiveCampaigns(5);
    setIsActive(true);
    // Default core features
    const coreFeatures = platformFeatures.filter((f) => f.isCore).map((f) => f.key);
    setSelectedFeatures(
      coreFeatures.length > 0
        ? coreFeatures
        : ['CUSTOMER_CRM', 'LOYALTY', 'BRANCHES', 'STAFF', 'BASIC_ANALYTICS']
    );
    setIsModalOpen(true);
  };

  const openEditModal = (plan: AdminPlan) => {
    setEditingPlan(plan);
    setName(plan.name);
    setSlug(plan.slug);
    setDescription(plan.description || '');
    setMonthlyPrice(plan.priceMinor / 100);
    setYearlyPrice((plan.yearlyPriceMinor ?? plan.priceMinor * 10) / 100);
    setMaxCustomers(plan.maxCustomers);
    setMaxBranches(plan.maxBranches);
    setMaxStaff(plan.maxStaff);

    const limits = plan.limits || {};
    setMaxRewards(limits.maxRewards ?? 10);
    setMaxOffers(limits.maxOffers ?? 5);
    setMonthlyAiDrafts(limits.monthlyAiDrafts ?? 50);
    setMaxActiveCampaigns(limits.maxActiveCampaigns ?? 5);

    setIsActive(plan.isActive);
    setSelectedFeatures(Array.isArray(plan.features) ? plan.features : []);
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (plan: AdminPlan) => {
    try {
      const nextStatus = !plan.isActive;
      const res = await fetch(`/api/admin/plans/${plan.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: nextStatus }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update plan status');
      }

      addToast({
        type: 'success',
        title: nextStatus ? 'Package Activated' : 'Package Deactivated',
        message: `${plan.name} is now ${nextStatus ? 'active for new subscriptions' : 'deactivated'}.`,
      });

      await fetchPlans();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleDeletePlan = async () => {
    if (!planToDelete) return;
    try {
      setIsDeleting(true);
      const url = `/api/admin/plans/${planToDelete.id}${reassignSubscribersToFree ? '?reassignToFree=true' : ''}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete package');
      }

      addToast({
        type: 'success',
        title: 'Package Deleted',
        message: `${planToDelete.name} has been removed.`,
      });

      setPlanToDelete(null);
      setReassignSubscribersToFree(false);
      await fetchPlans();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Cannot Delete Package',
        message: err.message,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const openAssignModal = async (plan: AdminPlan) => {
    setPlanToAssign(plan);
    setSelectedBusinessId('');
    setAssignInterval('MONTHLY');
    setBusinessSearch('');
    try {
      setIsLoadingBusinesses(true);
      const res = await fetch('/api/admin/businesses?pageSize=50', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        setBusinesses(json.items || []);
      }
    } catch (err) {
      console.error('Error fetching businesses for assignment:', err);
    } finally {
      setIsLoadingBusinesses(false);
    }
  };

  const handleExecuteAssignPlan = async () => {
    if (!planToAssign || !selectedBusinessId) return;
    try {
      setIsAssigning(true);
      const res = await fetch(`/api/admin/businesses/${selectedBusinessId}/assign-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          planId: planToAssign.id,
          billingInterval: assignInterval,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to assign plan to business');
      }

      const assignedBusiness = businesses.find((b) => b.id === selectedBusinessId);
      addToast({
        type: 'success',
        title: 'Package Assigned Successfully',
        message: `${planToAssign.name} assigned to ${assignedBusiness?.name || 'business'}. Entitlements updated.`,
      });

      setPlanToAssign(null);
      await fetchPlans();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Assignment Failed',
        message: err.message,
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const toggleFeature = (key: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllFeatures = () => {
    setSelectedFeatures(platformFeatures.map((f) => f.key));
  };

  const selectCoreOnlyFeatures = () => {
    setSelectedFeatures(platformFeatures.filter((f) => f.isCore).map((f) => f.key));
  };

  const clearAllFeatures = () => {
    setSelectedFeatures([]);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast({ type: 'error', title: 'Plan name is required' });
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        priceMinor: Math.round(monthlyPrice * 100),
        yearlyPriceMinor: Math.round(yearlyPrice * 100),
        maxCustomers: Number(maxCustomers),
        maxBranches: Number(maxBranches),
        maxStaff: Number(maxStaff),
        isActive,
        features: selectedFeatures,
        limits: {
          maxRewards: Number(maxRewards),
          maxOffers: Number(maxOffers),
          monthlyAiDrafts: Number(monthlyAiDrafts),
          maxActiveCampaigns: Number(maxActiveCampaigns),
        },
      };

      let res: Response;
      if (editingPlan) {
        res = await fetch(`/api/admin/plans/${editingPlan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...payload,
            slug: slug.trim().toLowerCase(),
          }),
        });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to save plan');
      }

      addToast({
        type: 'success',
        title: editingPlan ? 'Plan updated successfully' : 'Plan created successfully',
      });
      setIsModalOpen(false);
      await fetchPlans();
    } catch (err: any) {
      addToast({ type: 'error', title: err.message || 'Error saving plan' });
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (minorUnits: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(minorUnits / 100);
  };

  const categories = ['ALL', 'CORE', 'ENGAGEMENT', 'COMMUNICATION', 'MANAGEMENT', 'ENTERPRISE'];

  const filteredFeatures =
    activeCategoryFilter === 'ALL'
      ? platformFeatures
      : platformFeatures.filter((f) => f.category === activeCategoryFilter);

  const filteredBusinesses = businesses.filter((b) =>
    b.name.toLowerCase().includes(businessSearch.toLowerCase()) ||
    b.slug.toLowerCase().includes(businessSearch.toLowerCase())
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <AdminPageHeader
        title="Packages & Subscription Plans"
        description="Configure subscription packages, quotas, pricing tiers, feature entitlements, and direct business plan assignment."
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="outline"
              onClick={handleOpenCleanupModal}
              disabled={isLoading || isExecutingCleanup}
              style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
            >
              <Sparkles size={16} style={{ marginRight: '6px' }} />
              Clean Up Catalogue
            </Button>
            <Button variant="outline" onClick={fetchPlans} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} style={{ marginRight: '6px' }} />
              Refresh
            </Button>
            <Button variant="primary" onClick={openCreateModal}>
              <Plus size={16} style={{ marginRight: '6px' }} />
              Create Package
            </Button>
          </div>
        }
      />

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#FEF2F2', border: '1px solid #EF4444', borderRadius: '8px', color: '#991B1B', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Catalogue Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          padding: '12px 16px',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            {showInactive
              ? 'Showing all packages (active catalogue and historical/inactive)'
              : 'Active Package Catalogue (canonical packages available for new business assignment)'}
          </span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#EEF2FF',
              color: 'var(--color-primary)',
            }}
          >
            {plans.length} {plans.length === 1 ? 'package' : 'packages'}
          </span>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            userSelect: 'none',
          }}
        >
          <Switch
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span>Show Inactive / Historical Plans</span>
        </label>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <Skeleton height="260px" radius="12px" />
          <Skeleton height="260px" radius="12px" />
          <Skeleton height="260px" radius="12px" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
          {plans.map((p) => {
            const planFeatures = Array.isArray(p.features) ? p.features : [];
            const subscriptionCount = p._count?.subscriptions ?? 0;
            const limits = p.limits || {};

            return (
              <Card
                key={p.id}
                style={{
                  padding: '22px',
                  position: 'relative',
                  border: p.isActive ? '1px solid var(--color-border)' : '1px dashed #9CA3AF',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: p.isActive ? 'var(--color-surface)' : '#FAFAFA',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                      {p.name}
                    </h3>
                    <code style={{ fontSize: '11px', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                      {p.slug}
                    </code>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: p.isActive ? '#ECFDF5' : '#F3F4F6',
                        color: p.isActive ? '#065F46' : '#6B7280',
                      }}
                    >
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(p)}
                      title={p.isActive ? 'Deactivate Package' : 'Activate Package'}
                      style={{
                        background: 'none',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        padding: '4px 6px',
                        cursor: 'pointer',
                        color: p.isActive ? '#059669' : '#9CA3AF',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <Power size={13} />
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '14px', minHeight: '38px', lineHeight: 1.4 }}>
                  {p.description || 'No description provided.'}
                </p>

                {/* Pricing Box */}
                <div style={{ backgroundColor: 'var(--color-bg)', padding: '12px', borderRadius: '8px', marginBottom: '14px', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Monthly:</span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(p.priceMinor)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Yearly:</span>
                    <strong style={{ color: 'var(--color-text-primary)' }}>
                      {formatCurrency(p.yearlyPriceMinor ?? p.priceMinor * 10)}
                    </strong>
                  </div>
                </div>

                {/* Subscribed Businesses Banner */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    backgroundColor: '#EEF2FF',
                    borderRadius: '6px',
                    marginBottom: '14px',
                    fontSize: '12px',
                    color: 'var(--color-primary)',
                    fontWeight: 600,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Building2 size={14} />
                    <span>{subscriptionCount} businesses subscribed</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openAssignModal(p)}
                    style={{ fontSize: '11px', height: '24px', padding: '0 8px', backgroundColor: '#FFFFFF' }}
                  >
                    Assign
                  </Button>
                </div>

                {/* Limits Grid */}
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Users size={13} color="var(--color-text-muted)" />
                    <span>Customers: <strong>{p.maxCustomers.toLocaleString()}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Store size={13} color="var(--color-text-muted)" />
                    <span>Branches: <strong>{p.maxBranches}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <UserCheck size={13} color="var(--color-text-muted)" />
                    <span>Staff: <strong>{p.maxStaff}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Gift size={13} color="var(--color-text-muted)" />
                    <span>Rewards: <strong>{limits.maxRewards ?? 10}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Tag size={13} color="var(--color-text-muted)" />
                    <span>Offers: <strong>{limits.maxOffers ?? 5}</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Zap size={13} color="var(--color-text-muted)" />
                    <span>AI Drafts: <strong>{limits.monthlyAiDrafts ?? 50}/mo</strong></span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', fontWeight: 600, fontSize: '12px', marginBottom: '8px' }}>
                  <Sparkles size={14} />
                  <span>{planFeatures.length} features entitled</span>
                </div>

                {/* Features Badges preview */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '16px', flex: 1 }}>
                  {planFeatures.slice(0, 6).map((fKey) => (
                    <span
                      key={fKey}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        fontWeight: 500,
                      }}
                    >
                      {fKey}
                    </span>
                  ))}
                  {planFeatures.length > 6 && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#F3F4F6',
                        color: '#4B5563',
                        fontWeight: 600,
                      }}
                    >
                      +{planFeatures.length - 6} more
                    </span>
                  )}
                </div>

                {/* Card Actions */}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
                  <Button
                    variant="outline"
                    style={{ flex: 1 }}
                    size="sm"
                    onClick={() => openEditModal(p)}
                  >
                    <Edit2 size={14} style={{ marginRight: '6px' }} />
                    Edit Package
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPlanToDelete(p)}
                    title="Delete Package"
                    style={{ color: '#DC2626' }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* PLAN EDIT / CREATE MODAL WITH INTERACTIVE CATEGORIZED FEATURE BUILDER */}
      {isModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsModalOpen(false)}
          title={editingPlan ? `Edit Package: ${editingPlan.name}` : 'Create Subscription Package & Feature Entitlements'}
        >
          <form onSubmit={handleSavePlan} style={{ display: 'grid', gap: '16px', padding: '8px 0', maxHeight: '78vh', overflowY: 'auto' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Package Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Professional Growth" required />
            </div>

            {!editingPlan && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Slug (Unique Identifier)</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. pro-growth" required />
              </div>
            )}

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief summary of target audience and key benefits" />
            </div>

            {/* Pricing */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Monthly Price (₹)</label>
                <Input type="number" min={0} value={monthlyPrice} onChange={(e) => setMonthlyPrice(Number(e.target.value))} required />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Yearly Price (₹)</label>
                <Input type="number" min={0} value={yearlyPrice} onChange={(e) => setYearlyPrice(Number(e.target.value))} required />
              </div>
            </div>

            {/* Capacity Limits */}
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Core Capacity Quotas
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Max Customers</label>
                  <Input type="number" min={1} value={maxCustomers} onChange={(e) => setMaxCustomers(Number(e.target.value))} required />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Max Branches</label>
                  <Input type="number" min={1} value={maxBranches} onChange={(e) => setMaxBranches(Number(e.target.value))} required />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Max Staff</label>
                  <Input type="number" min={1} value={maxStaff} onChange={(e) => setMaxStaff(Number(e.target.value))} required />
                </div>
              </div>
            </div>

            {/* Feature Usage Quotas */}
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Engagement & Automation Limits
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Max Rewards</label>
                  <Input type="number" min={1} value={maxRewards} onChange={(e) => setMaxRewards(Number(e.target.value))} required />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Max Offers</label>
                  <Input type="number" min={1} value={maxOffers} onChange={(e) => setMaxOffers(Number(e.target.value))} required />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>AI Drafts/Mo</label>
                  <Input type="number" min={0} value={monthlyAiDrafts} onChange={(e) => setMonthlyAiDrafts(Number(e.target.value))} required />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Active Campaigns</label>
                  <Input type="number" min={1} value={maxActiveCampaigns} onChange={(e) => setMaxActiveCampaigns(Number(e.target.value))} required />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Active for New Subscriptions</span>
              <Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            </div>

            {/* FEATURE ENTITLEMENTS BUILDER */}
            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={16} />
                    Platform Feature Entitlements ({selectedFeatures.length} selected)
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0 }}>
                    Select modules included in this package. Enforced server-side via canonical feature checks.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button type="button" size="sm" variant="outline" onClick={selectAllFeatures}>
                    Select All
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={selectCoreOnlyFeatures}>
                    Core Only
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={clearAllFeatures}>
                    Clear
                  </Button>
                </div>
              </div>

              {/* Category tabs */}
              <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '10px' }}>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategoryFilter(cat)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '16px',
                      border: activeCategoryFilter === cat ? '1px solid var(--color-primary)' : '1px solid #E2E8F0',
                      backgroundColor: activeCategoryFilter === cat ? 'var(--color-primary)' : '#FFFFFF',
                      color: activeCategoryFilter === cat ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Feature checkboxes list */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '8px',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  padding: '6px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                }}
              >
                {filteredFeatures.map((feat) => {
                  const isChecked = selectedFeatures.includes(feat.key);
                  return (
                    <div
                      key={feat.key}
                      onClick={() => toggleFeature(feat.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: isChecked ? '#EFF6FF' : '#FFFFFF',
                        border: isChecked ? '1px solid #93C5FD' : '1px solid #E2E8F0',
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <div style={{ marginTop: '2px', color: isChecked ? '#2563EB' : '#94A3B8' }}>
                        {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: isChecked ? '#1E3A8A' : '#1E293B' }}>
                            {feat.label}
                          </span>
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              backgroundColor: feat.isCore ? '#DCFCE7' : '#F1F5F9',
                              color: feat.isCore ? '#166534' : '#475569',
                              textTransform: 'uppercase',
                            }}
                          >
                            {feat.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', lineHeight: '1.3' }}>
                          {feat.description}
                        </div>
                        <code style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px', display: 'block' }}>
                          {feat.key}
                        </code>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Package'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {planToDelete && (
        <Modal
          isOpen={true}
          onClose={() => {
            setPlanToDelete(null);
            setReassignSubscribersToFree(false);
          }}
          title={`Delete Package: ${planToDelete.name}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                padding: 'var(--space-4)',
                backgroundColor: '#FEF2F2',
                borderRadius: 'var(--radius-md)',
                color: '#991B1B',
              }}
            >
              <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Permanent Deletion Check</div>
                <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
                  Deleting <strong>{planToDelete.name}</strong> will remove it permanently if there are no existing business subscriptions.
                  If businesses are actively subscribed, you can either reassign them safely to Free Starter or cancel deletion.
                </div>
              </div>
            </div>

            {(planToDelete._count?.subscriptions ?? 0) > 0 && (
              <div style={{ fontSize: 13, color: '#B45309', backgroundColor: '#FEF3C7', padding: '12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <strong>Active Subscriptions Found:</strong> {planToDelete._count?.subscriptions} business(es) currently use this package.
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: '#92400E' }}>
                  <input
                    type="checkbox"
                    checked={reassignSubscribersToFree}
                    onChange={(e) => setReassignSubscribersToFree(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span>Safely reassign subscribed businesses to canonical Free Starter and proceed with deletion</span>
                </label>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button
                variant="outline"
                size="md"
                onClick={() => {
                  setPlanToDelete(null);
                  setReassignSubscribersToFree(false);
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                loading={isDeleting}
                disabled={(planToDelete._count?.subscriptions ?? 0) > 0 && !reassignSubscribersToFree}
                onClick={handleDeletePlan}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* BULK PACKAGE CLEANUP MODAL */}
      {isCleanupModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (!isExecutingCleanup) {
              setIsCleanupModalOpen(false);
            }
          }}
          title="Clean Up Packages & Retain Only Free"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '78vh', overflowY: 'auto' }}>
            {isLoadingCleanupPreview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px 0' }}>
                <Skeleton height="60px" radius="8px" />
                <Skeleton height="100px" radius="8px" />
                <Skeleton height="80px" radius="8px" />
              </div>
            ) : cleanupPreview ? (
              <>
                {/* Free Plan Retained Banner */}
                <div
                  style={{
                    padding: '14px 16px',
                    backgroundColor: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    borderRadius: 'var(--radius-md)',
                    color: '#065F46',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
                    <Sparkles size={18} />
                    <span>Canonical Package Preserved</span>
                  </div>
                  <div style={{ fontSize: '13px', marginTop: '4px', lineHeight: 1.4 }}>
                    <strong>{cleanupPreview.canonicalFreePlan.name}</strong> (slug: <code>{cleanupPreview.canonicalFreePlan.slug}</code>, ₹0) will remain active as the sole package in the active package catalogue.
                  </div>
                </div>

                {/* Metrics Summary Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ padding: '12px', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Packages to Remove
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>
                      {cleanupPreview.unwantedPlans.length}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      Manually created test plans
                    </div>
                  </div>

                  <div style={{ padding: '12px', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Businesses to Reassign
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-primary)', marginTop: '2px' }}>
                      {cleanupPreview.affectedBusinesses.length}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      Will receive Free Starter
                    </div>
                  </div>
                </div>

                {/* Notice on safety and data preservation */}
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '8px',
                    color: '#1E40AF',
                    fontSize: '12px',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Safety & Referential Integrity Guarantees:</strong>
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px' }}>
                    <li>No businesses, customer records, or loyalty points will be deleted.</li>
                    <li>All historical invoices, payments, and audit log references are preserved.</li>
                    <li>Subscribed businesses are safely moved to Free Starter without data loss.</li>
                    <li>Seed plans with subscriptions/invoices are deactivated from the catalogue instead of deleted.</li>
                  </ul>
                </div>

                {/* Preview list of unwanted plans */}
                {cleanupPreview.unwantedPlans.length > 0 && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                      Unwanted Packages Identified ({cleanupPreview.unwantedPlans.length}):
                    </div>
                    <div
                      style={{
                        maxHeight: '130px',
                        overflowY: 'auto',
                        border: '1px solid var(--color-border)',
                        borderRadius: '6px',
                        backgroundColor: 'var(--color-surface)',
                      }}
                    >
                      {cleanupPreview.unwantedPlans.map((p: any) => (
                        <div
                          key={p.id}
                          style={{
                            padding: '6px 10px',
                            borderBottom: '1px solid var(--color-border)',
                            fontSize: '12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600 }}>{p.name}</span>{' '}
                            <code style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>({p.slug})</code>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                            {p.subscriptionsCount} sub(s)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modal Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: '8px' }}>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => setIsCleanupModalOpen(false)}
                    disabled={isExecutingCleanup}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    loading={isExecutingCleanup}
                    disabled={isExecutingCleanup}
                    onClick={handleExecuteCleanup}
                  >
                    Confirm & Execute Cleanup
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </Modal>
      )}

      {/* ASSIGN PACKAGE TO BUSINESS MODAL */}
      {planToAssign && (
        <Modal
          isOpen={true}
          onClose={() => setPlanToAssign(null)}
          title={`Assign Package: ${planToAssign.name}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '75vh', overflowY: 'auto' }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4 }}>
              Select a business tenant to atomically assign the <strong>{planToAssign.name}</strong> package. Feature entitlements and capacity limits will apply immediately.
            </p>

            {/* Plan Summary Banner */}
            <div style={{ padding: '10px 14px', backgroundColor: '#EEF2FF', borderRadius: '8px', border: '1px solid #C7D2FE', fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                Target: {planToAssign.name} ({formatCurrency(planToAssign.priceMinor)}/mo)
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Includes: {planToAssign.features.length} features, up to {planToAssign.maxCustomers} customers, {planToAssign.maxBranches} branches.
              </div>
            </div>

            {/* Billing Interval Selection */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Billing Cycle
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="billingInterval"
                    value="MONTHLY"
                    checked={assignInterval === 'MONTHLY'}
                    onChange={() => setAssignInterval('MONTHLY')}
                  />
                  Monthly ({formatCurrency(planToAssign.priceMinor)}/mo)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="billingInterval"
                    value="YEARLY"
                    checked={assignInterval === 'YEARLY'}
                    onChange={() => setAssignInterval('YEARLY')}
                  />
                  Yearly ({formatCurrency(planToAssign.yearlyPriceMinor ?? planToAssign.priceMinor * 10)}/yr)
                </label>
              </div>
            </div>

            {/* Business Search & Selection */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Select Business Tenant
              </label>
              <Input
                placeholder="Search businesses..."
                value={businessSearch}
                onChange={(e) => setBusinessSearch(e.target.value)}
                style={{ marginBottom: 8 }}
              />

              {isLoadingBusinesses ? (
                <div style={{ padding: 16, textAlign: 'center' }}>
                  <Skeleton height="36px" />
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: 'auto',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  {filteredBusinesses.map((b) => {
                    const isSelected = selectedBusinessId === b.id;
                    const currentPlanName = b.subscription?.plan?.name || 'No active plan';

                    return (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBusinessId(b.id)}
                        style={{
                          padding: '10px 12px',
                          borderBottom: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background-color 120ms ease',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>
                            {b.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                            Slug: {b.slug} • Status: {b.status}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>
                            Current: {currentPlanName}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredBusinesses.length === 0 && (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>
                      No businesses matching "{businessSearch}".
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 8 }}>
              <Button
                variant="outline"
                size="md"
                onClick={() => setPlanToAssign(null)}
                disabled={isAssigning}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={!selectedBusinessId || isAssigning}
                loading={isAssigning}
                onClick={handleExecuteAssignPlan}
                rightIcon={<ArrowRight size={14} />}
              >
                Confirm Assignment
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminPlansView;
