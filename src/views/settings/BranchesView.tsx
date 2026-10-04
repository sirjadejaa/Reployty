import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  MapPin,
  Phone,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTenant } from '../../context/TenantContext';
import { useToast } from '../../context/ToastContext';
import { AdminRoute } from '../../types/loyalty';
import { BranchItem } from '../../types/business';

export interface BranchesViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

export const BranchesView: React.FC<BranchesViewProps> = () => {
  const { currentBusiness } = useTenant();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    state: '',
    country: 'IN',
    postalCode: '',
    phone: '',
    timezone: 'UTC',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    isMainBranch: false,
  });

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/business/branches');
      if (res.ok) {
        const json = await res.json();
        setBranches(json);
      } else {
        addToast({
          type: 'error',
          title: 'Failed to load branches',
          message: 'Unable to retrieve branch list.',
        });
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, [currentBusiness.id]);

  const openCreateModal = () => {
    setEditingBranch(null);
    setFormData({
      name: '',
      code: '',
      address: '',
      city: '',
      state: '',
      country: 'IN',
      postalCode: '',
      phone: '',
      timezone: 'UTC',
      status: 'ACTIVE',
      isMainBranch: branches.length === 0,
    });
    setModalOpen(true);
  };

  const openEditModal = (b: BranchItem) => {
    setEditingBranch(b);
    setFormData({
      name: b.name,
      code: b.code || '',
      address: b.address || '',
      city: b.city || '',
      state: b.state || '',
      country: b.country || 'IN',
      postalCode: b.postalCode || '',
      phone: b.phone || '',
      timezone: b.timezone || 'UTC',
      status: b.status === 'CLOSED' ? 'INACTIVE' : b.status,
      isMainBranch: b.isMainBranch,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast({ type: 'error', title: 'Validation error', message: 'Branch name is required.' });
      return;
    }

    setSubmitting(true);
    try {
      if (editingBranch) {
        // Update existing branch
        const res = await fetch(`/api/business/branches/${editingBranch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update branch');
        }

        addToast({
          type: 'success',
          title: 'Branch updated',
          message: `${formData.name} has been updated.`,
        });
      } else {
        // Create new branch
        const res = await fetch('/api/business/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create branch');
        }

        addToast({
          type: 'success',
          title: 'Branch created',
          message: `${formData.name} has been added to your business.`,
        });
      }

      setModalOpen(false);
      await fetchBranches();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Operation failed',
        message: err.message || 'Could not save branch.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Branch Locations"
        description="Manage physical business outlets, cash counters, and operating regions."
        actions={
          <Button
            variant="primary"
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            Add Branch
          </Button>
        }
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Skeleton height={100} radius="var(--radius-lg)" />
          <Skeleton height={100} radius="var(--radius-lg)" />
        </div>
      ) : branches.length === 0 ? (
        <Card style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
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
            <Building2 size={24} />
          </div>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: '0 0 8px' }}>
            No branches added yet
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', maxWidth: 420, margin: '0 auto 20px' }}>
            Add your primary location or flagship store to organize stamps, cashiers, and customer visits.
          </p>
          <Button variant="primary" onClick={openCreateModal}>
            Add First Branch
          </Button>
        </Card>
      ) : (
        <div className="responsive-two-col" style={{ gap: 'var(--space-4)' }}>
          {branches.map((b) => (
            <Card
              key={b.id}
              style={{
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: b.isMainBranch ? '1px solid #C7D2FE' : '1px solid var(--color-border-subtle)',
                backgroundColor: b.status === 'INACTIVE' ? '#F8FAFC' : '#FFFFFF',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                        {b.name}
                      </h3>
                      {b.isMainBranch && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            backgroundColor: '#EEF2FF',
                            color: '#4F6BFF',
                          }}
                        >
                          Main Branch
                        </span>
                      )}
                    </div>
                    {b.code && (
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-muted)' }}>
                        CODE: {b.code}
                      </span>
                    )}
                  </div>

                  <StatusBadge
                    status={b.status === 'ACTIVE' ? 'active' : 'inactive'}
                    label={b.status}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <MapPin size={15} style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-text-muted)' }} />
                    <span>{b.address ? `${b.address}${b.city ? `, ${b.city}` : ''}` : 'No address set'}</span>
                  </div>

                  {b.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Phone size={15} style={{ color: 'var(--color-text-muted)' }} />
                      <span>{b.phone}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={15} style={{ color: 'var(--color-text-muted)' }} />
                    <span>{b.timezone}</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 'var(--space-3)',
                  borderTop: '1px solid var(--color-border-subtle)',
                }}
              >
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {b._count?.staff ?? 0} staff members
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openEditModal(b)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit2 size={13} />
                  Edit Branch
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Branch Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBranch ? `Edit ${editingBranch.name}` : 'Add New Branch'}
        maxWidth="540px"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            label="Branch Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Westside Studio"
          />

          <div className="form-grid-2">
            <Input
              label="Location Code (Optional)"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="e.g. WS-01"
            />

            <Input
              label="Branch Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 000-0000"
            />
          </div>

          <Input
            label="Street Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="123 Commerce Way"
          />

          <div className="form-grid-3">
            <Input
              label="City"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="Downtown"
            />

            <Input
              label="State"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              placeholder="CA"
            />

            <Input
              label="Postal Code"
              value={formData.postalCode}
              onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
              placeholder="94105"
            />
          </div>

          <div className="form-grid-2">
            <Select
              label="Operating Timezone"
              value={formData.timezone}
              onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
              options={[
                { value: 'UTC', label: 'UTC' },
                { value: 'America/New_York', label: 'Eastern (ET)' },
                { value: 'America/Chicago', label: 'Central (CT)' },
                { value: 'America/Denver', label: 'Mountain (MT)' },
                { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
                { value: 'Asia/Kolkata', label: 'IST (India)' },
                { value: 'Europe/London', label: 'GMT / London' },
              ]}
            />

            {editingBranch && (
              <Select
                label="Branch Status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                options={[
                  { value: 'ACTIVE', label: 'Active (Operational)' },
                  { value: 'INACTIVE', label: 'Inactive (Suspended)' },
                ]}
              />
            )}
          </div>

          <label className="checkbox-control" style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1)' }}>
            <input
              type="checkbox"
              id="isMainBranch"
              checked={formData.isMainBranch}
              onChange={(e) => setFormData({ ...formData, isMainBranch: e.target.checked })}
              className="checkbox-input"
              style={{ display: 'none' }}
            />
            <span className="checkbox-box" style={{ width: 18, height: 18 }}>
              {formData.isMainBranch && <CheckCircle size={14} />}
            </span>
            <span>Set as main headquarters branch</span>
          </label>

          <div className="form-actions">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : editingBranch ? 'Update Branch' : 'Create Branch'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
