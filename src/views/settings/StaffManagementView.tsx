import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Plus,
  Edit2,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Avatar } from '../../components/ui/Avatar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AdminRoute } from '../../types/loyalty';
import { StaffMemberItem, BranchItem, BusinessRole } from '../../types/business';

export interface StaffManagementViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

export const StaffManagementView: React.FC<StaffManagementViewProps> = () => {
  const { currentBusiness } = useTenant();
  const { user: authUser } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMemberItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [roles, setRoles] = useState<BusinessRole[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMemberItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    roleId: '',
    branchId: '',
    status: 'ACTIVE' as 'ACTIVE' | 'DEACTIVATED',
  });

  const fetchData = async () => {
    try {
      const [staffRes, branchesRes, rolesRes] = await Promise.all([
        fetch('/api/business/staff'),
        fetch('/api/business/branches'),
        fetch('/api/business/roles'),
      ]);

      if (staffRes.ok) {
        setStaff(await staffRes.json());
      }
      if (branchesRes.ok) {
        setBranches(await branchesRes.json());
      }
      if (rolesRes.ok) {
        const rolesJson = await rolesRes.json();
        setRoles(rolesJson);
        const defaultRole = rolesJson.find((r: any) => r.name === 'STAFF') || rolesJson[0];
        if (defaultRole && !formData.roleId) {
          setFormData((prev) => ({ ...prev, roleId: defaultRole.id }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch staff data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentBusiness.id]);

  const openInviteModal = () => {
    setEditingStaff(null);
    const defaultRole = roles.find((r) => r.name === 'STAFF') || roles[0];
    setFormData({
      name: '',
      email: '',
      phone: '',
      roleId: defaultRole?.id || '',
      branchId: branches[0]?.id || '',
      status: 'ACTIVE',
    });
    setModalOpen(true);
  };

  const openEditModal = (member: StaffMemberItem) => {
    setEditingStaff(member);
    setFormData({
      name: member.user.name,
      email: member.user.email,
      phone: member.user.phone || '',
      roleId: member.role.id,
      branchId: member.branch?.id || '',
      status: member.status === 'DEACTIVATED' ? 'DEACTIVATED' : 'ACTIVE',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingStaff && (!formData.name.trim() || !formData.email.trim())) {
      addToast({ type: 'error', title: 'Validation error', message: 'Name and email are required.' });
      return;
    }

    setSubmitting(true);
    try {
      if (editingStaff) {
        // Prevent self-deactivation
        if (editingStaff.user.id === authUser?.id && formData.status === 'DEACTIVATED') {
          throw new Error('Self-lockout prevention: You cannot deactivate your own account.');
        }

        const res = await fetch(`/api/business/staff/${editingStaff.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleId: formData.roleId,
            branchId: formData.branchId || null,
            status: formData.status,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update team member');
        }

        addToast({
          type: 'success',
          title: 'Member updated',
          message: `${formData.name}'s role and status updated.`,
        });
      } else {
        // Invite / Add staff member
        const res = await fetch('/api/business/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            phone: formData.phone || undefined,
            roleId: formData.roleId,
            branchId: formData.branchId || undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to add team member');
        }

        addToast({
          type: 'success',
          title: 'Team member added',
          message: `${formData.name} has been invited to this business.`,
        });
      }

      setModalOpen(false);
      await fetchData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Operation failed',
        message: err.message || 'Could not save staff membership.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleBadgeColor = (roleName: string) => {
    switch (roleName) {
      case 'OWNER':
        return { bg: '#FEF3C7', color: '#B45309' };
      case 'MANAGER':
        return { bg: '#EFF6FF', color: '#1D4ED8' };
      default:
        return { bg: '#F1F5F9', color: '#475569' };
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Team & Staff Management"
        description="Manage user permissions, roles, and branch assignments across your business."
        actions={
          <Button
            variant="primary"
            onClick={openInviteModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            Invite Team Member
          </Button>
        }
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Skeleton height={80} radius="var(--radius-lg)" />
          <Skeleton height={240} radius="var(--radius-lg)" />
        </div>
      ) : staff.length === 0 ? (
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
            <UserCheck size={24} />
          </div>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: '0 0 8px' }}>
            No team members added yet
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', maxWidth: 420, margin: '0 auto 20px' }}>
            Invite managers or cashiers so they can manage stamp cards and customer visits.
          </p>
          <Button variant="primary" onClick={openInviteModal}>
            Invite First Member
          </Button>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Member</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Role</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Branch</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Status</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Joined</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => {
                  const roleColors = getRoleBadgeColor(m.role.name);
                  const isCurrentAuthUser = m.user.id === authUser?.id;

                  return (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-subtle)',
                        backgroundColor: m.status === 'DEACTIVATED' ? '#F8FAFC' : '#FFFFFF',
                      }}
                    >
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Avatar
                            name={m.user.name}
                            src={m.user.avatarUrl || undefined}
                            size="sm"
                          />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{m.user.name}</span>
                              {isCurrentAuthUser && (
                                <span style={{ fontSize: '10px', backgroundColor: '#EEF2FF', color: '#4F6BFF', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
                                  You
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                              {m.user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '10px',
                            backgroundColor: roleColors.bg,
                            color: roleColors.color,
                            letterSpacing: '0.02em',
                          }}
                        >
                          {m.role.name}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', color: 'var(--color-text-secondary)' }}>
                        {m.branch?.name || (
                          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                            All branches
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <StatusBadge
                          status={m.status === 'ACTIVE' ? 'active' : 'inactive'}
                          label={m.status}
                        />
                      </td>

                      <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)', fontSize: '12px' }}>
                        {new Date(m.createdAt).toLocaleDateString()}
                      </td>

                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditModal(m)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Edit2 size={13} /> Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Invite / Edit Staff Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingStaff ? `Edit ${editingStaff.user.name}` : 'Invite Team Member'}
        maxWidth="540px"
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {!editingStaff && (
            <>
              <Input
                label="Full Name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Sarah Jenkins"
              />

              <Input
                label="Email Address"
                required
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="sarah@example.com"
              />

              <Input
                label="Phone Number (Optional)"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
              />
            </>
          )}

          <Select
            label="Assigned Role"
            required
            value={formData.roleId}
            onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
            options={roles.map((r) => ({
              value: r.id,
              label: `${r.name} — ${r.name === 'OWNER' ? 'Full business ownership' : r.name === 'MANAGER' ? 'Manage branches & staff' : 'Cashier stamps & rewards'}`,
            }))}
          />

          <Select
            label="Branch Assignment"
            value={formData.branchId}
            onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
            options={[
              { value: '', label: 'All Branches (Enterprise / Floating)' },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />

          {editingStaff && (
            <div>
              <Select
                label="Membership Status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                options={[
                  { value: 'ACTIVE', label: 'Active (Granted access)' },
                  { value: 'DEACTIVATED', label: 'Deactivated (Access revoked)' },
                ]}
              />
              {editingStaff.user.id === authUser?.id && (
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  Self-lockout protection active: you cannot deactivate your own account.
                </div>
              )}
            </div>
          )}

          <div className="form-actions">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : editingStaff ? 'Update Member' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
