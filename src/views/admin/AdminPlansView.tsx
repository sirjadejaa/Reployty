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

interface AdminPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMinor: number;
  yearlyPriceMinor: number | null;
  currency: string;
  billingInterval: string;
  features: string[];
  limits: Record<string, number | null>;
  maxCustomers: number;
  maxBranches: number;
  maxStaff: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PlatformFeature {
  key: string;
  label: string;
  category: 'CORE' | 'ENGAGEMENT' | 'COMMUNICATION' | 'MANAGEMENT' | 'ENTERPRISE';
  description: string;
  isCore: boolean;
}

export const AdminPlansView: React.FC = () => {
  const { addToast } = useToast();
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [platformFeatures, setPlatformFeatures] = useState<PlatformFeature[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
  const [isActive, setIsActive] = useState<boolean>(true);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');

  const fetchPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [plansRes, featuresRes] = await Promise.all([
        fetch('/api/admin/plans', {
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
        setPlatformFeatures(featJson.features || []);
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
  }, []);

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
    setIsActive(true);
    // Default: all core features enabled
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
    setIsActive(plan.isActive);
    setSelectedFeatures(Array.isArray(plan.features) ? plan.features : []);
    setIsModalOpen(true);
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

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <AdminPageHeader
        title="Subscription Plans & Feature Entitlements"
        description="Configure platform plans, pricing intervals, capacity limits, and modular feature entitlements."
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="outline" onClick={fetchPlans} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} style={{ marginRight: '6px' }} />
              Refresh
            </Button>
            <Button variant="primary" onClick={openCreateModal}>
              <Plus size={16} style={{ marginRight: '6px' }} />
              Create Plan
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

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <Skeleton height="240px" radius="12px" />
          <Skeleton height="240px" radius="12px" />
          <Skeleton height="240px" radius="12px" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {plans.map((p) => {
            const planFeatures = Array.isArray(p.features) ? p.features : [];
            return (
              <Card key={p.id} style={{ padding: '22px', position: 'relative', border: p.isActive ? '1px solid var(--border-color)' : '1px dashed #9CA3AF', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {p.name}
                    </h3>
                    <code style={{ fontSize: '12px', color: 'var(--text-muted)', backgroundColor: 'var(--background-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                      {p.slug}
                    </code>
                  </div>

                  <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', backgroundColor: p.isActive ? '#ECFDF5' : '#F3F4F6', color: p.isActive ? '#065F46' : '#6B7280' }}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', minHeight: '38px' }}>
                  {p.description || 'No description provided.'}
                </p>

                <div style={{ backgroundColor: 'var(--background-secondary)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Monthly:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(p.priceMinor)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Yearly:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(p.yearlyPriceMinor ?? p.priceMinor * 10)}
                    </strong>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'grid', gap: '6px', marginBottom: '16px' }}>
                  <div>Customers Limit: <strong>{p.maxCustomers.toLocaleString()}</strong></div>
                  <div>Branches Limit: <strong>{p.maxBranches}</strong></div>
                  <div>Staff Limit: <strong>{p.maxStaff}</strong></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary-color)', fontWeight: 600 }}>
                    <Sparkles size={14} />
                    <span>{planFeatures.length} features entitled</span>
                  </div>
                </div>

                {/* Features Badges preview */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '20px', flex: 1 }}>
                  {planFeatures.slice(0, 7).map((fKey) => (
                    <span
                      key={fKey}
                      style={{
                        fontSize: '11px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        fontWeight: 500,
                      }}
                    >
                      {fKey}
                    </span>
                  ))}
                  {planFeatures.length > 7 && (
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        backgroundColor: '#F3F4F6',
                        color: '#4B5563',
                        fontWeight: 600,
                      }}
                    >
                      +{planFeatures.length - 7} more
                    </span>
                  )}
                </div>

                <Button variant="outline" style={{ width: '100%', marginTop: 'auto' }} onClick={() => openEditModal(p)}>
                  <Edit2 size={15} style={{ marginRight: '6px' }} />
                  Edit Plan & Features
                </Button>
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
          title={editingPlan ? `Edit Plan & Entitlements: ${editingPlan.name}` : 'Create Subscription Plan & Feature Entitlements'}
        >
          <form onSubmit={handleSavePlan} style={{ display: 'grid', gap: '16px', padding: '8px 0', maxHeight: '78vh', overflowY: 'auto' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Plan Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Professional Growth" required />
            </div>

            {!editingPlan && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Slug (Unique Code)</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. pro-growth" required />
              </div>
            )}

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief summary of target audience and key benefits" />
            </div>

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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Max Customers</label>
                <Input type="number" min={1} value={maxCustomers} onChange={(e) => setMaxCustomers(Number(e.target.value))} required />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Max Branches</label>
                <Input type="number" min={1} value={maxBranches} onChange={(e) => setMaxBranches(Number(e.target.value))} required />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Max Staff</label>
                <Input type="number" min={1} value={maxStaff} onChange={(e) => setMaxStaff(Number(e.target.value))} required />
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
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={16} />
                    Platform Feature Entitlements ({selectedFeatures.length} selected)
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Check modules included in this plan. Businesses subscribed to this plan unlock these features.
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
                      border: activeCategoryFilter === cat ? '1px solid var(--primary-color)' : '1px solid #E2E8F0',
                      backgroundColor: activeCategoryFilter === cat ? 'var(--primary-color)' : '#FFFFFF',
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
                {isSaving ? 'Saving...' : editingPlan ? 'Save Changes' : 'Create Plan'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

