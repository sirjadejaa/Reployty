import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit2,
  AlertTriangle,
  RefreshCw,
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

export const AdminPlansView: React.FC = () => {
  const { addToast } = useToast();
  const [plans, setPlans] = useState<AdminPlan[]>([]);
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

  const fetchPlans = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/admin/plans', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch platform subscription plans');
      const data: AdminPlan[] = await res.json();
      setPlans(data);
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
    setIsModalOpen(true);
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
            features: ['CUSTOMER_CRM', 'LOYALTY', 'CATALOG'],
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

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <AdminPageHeader
        title="Subscription Plans Management"
        description="Configure platform plans, pricing intervals, feature entitlements, and capacity limits."
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {plans.map((p) => (
            <Card key={p.id} style={{ padding: '22px', position: 'relative', border: p.isActive ? '1px solid var(--border-color)' : '1px dashed #9CA3AF' }}>
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

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'grid', gap: '6px', marginBottom: '20px' }}>
                <div>Customers Limit: <strong>{p.maxCustomers.toLocaleString()}</strong></div>
                <div>Branches Limit: <strong>{p.maxBranches}</strong></div>
                <div>Staff Limit: <strong>{p.maxStaff}</strong></div>
                <div>Features Count: <strong>{((p.features as string[]) || []).length} features enabled</strong></div>
              </div>

              <Button variant="outline" style={{ width: '100%' }} onClick={() => openEditModal(p)}>
                <Edit2 size={15} style={{ marginRight: '6px' }} />
                Edit Plan Settings
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* PLAN EDIT / CREATE MODAL */}
      {isModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsModalOpen(false)}
          title={editingPlan ? `Edit Plan: ${editingPlan.name}` : 'Create New Subscription Plan'}
        >
          <form onSubmit={handleSavePlan} style={{ display: 'grid', gap: '16px', padding: '8px 0' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Plan Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            {!editingPlan && (
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Slug (Code)</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. pro-scale" required />
              </div>
            )}

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>Active for New Subscriptions</span>
              <Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
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
