import React, { useState, useEffect } from 'react';
import {
  Shield,
  RefreshCw,
  Users,
  Check,
} from 'lucide-react';
import { PlatformRole, AdminRoute } from '../../types/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

export interface AdminRolesViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

export const AdminRolesView: React.FC<AdminRolesViewProps> = () => {
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<PlatformRole | null>(null);

  const fetchRoles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/admin/roles', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to load roles (HTTP ${res.status})`);
      }

      const json = await res.json();
      setRoles(json.roles || []);
      if (json.roles && json.roles.length > 0) {
        setSelectedRole(json.roles[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with administration service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <Skeleton height="60px" />
        <div className="responsive-two-col">
          <Skeleton height="350px" />
          <Skeleton height="350px" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load role permissions"
        message={error}
        onRetry={fetchRoles}
      />
    );
  }

  // Group permissions by category
  const permissionsByCategory = selectedRole
    ? selectedRole.permissions.reduce((acc, p) => {
        const cat = p.category || 'General';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(p);
        return acc;
      }, {} as Record<string, typeof selectedRole.permissions>)
    : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <AdminPageHeader
        title="Roles & Permissions"
        description="Immutable system-level RBAC privilege definitions enforcing tenant boundaries."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRoles}
            leftIcon={<RefreshCw size={13} />}
          >
            Refresh
          </Button>
        }
      />

      {/* Master-Detail Layout */}
      <div className="responsive-two-col" style={{ alignItems: 'start' }}>
        {/* Left Column: Role List */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 2 }}>
            System Roles
          </div>

          {roles.map(r => {
            const isSelected = selectedRole?.id === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRole(r)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '14px',
                  borderRadius: '8px',
                  border: isSelected ? '1.5px solid #4F6BFF' : '1px solid #E2E8F0',
                  backgroundColor: isSelected ? '#EEF2FF' : '#FFFFFF',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '14px',
                      color: isSelected ? '#4F6BFF' : '#0F172A',
                    }}
                  >
                    {r.name}
                  </span>

                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isSelected ? '#DBEAFE' : '#F1F5F9',
                      color: isSelected ? '#1E40AF' : '#64748B',
                      textTransform: 'uppercase',
                    }}
                  >
                    System Role
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
                  {r.description}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: '11px', color: '#64748B' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Users size={12} />
                    <span>{r.membershipsCount} members</span>
                  </span>
                  <span>•</span>
                  <span>{r.permissions.length} permissions</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Column: Permission Details */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
          }}
        >
          {selectedRole ? (
            <>
              <div style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Shield size={18} color="#4F6BFF" />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                    {selectedRole.name} Privileges
                  </h3>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>
                  {selectedRole.description}
                </p>
              </div>

              {/* Categorized Permissions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {Object.entries(permissionsByCategory).map(([category, perms]) => (
                  <div key={category}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#94A3B8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      {category}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {perms.map(p => (
                        <div
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            backgroundColor: '#F8FAFC',
                            borderRadius: '6px',
                            border: '1px solid #F1F5F9',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                                {p.name}
                              </span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  color: '#4F6BFF',
                                  backgroundColor: '#EEF2FF',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                }}
                              >
                                {p.code}
                              </span>
                            </div>
                            {p.description && (
                              <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2 }}>
                                {p.description}
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              backgroundColor: '#DCFCE7',
                              color: '#16A34A',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              marginTop: 2,
                            }}
                          >
                            <Check size={12} strokeWidth={2.5} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
              Select a role from the list to view its permission allocations.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
