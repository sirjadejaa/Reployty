import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AdminRoute } from '../../types/loyalty';
import { BusinessProfile } from '../../types/business';

export interface BusinessProfileViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

export const BusinessProfileView: React.FC<BusinessProfileViewProps> = () => {
  const { currentBusiness } = useTenant();
  const { refreshAuth } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    category: 'CAFE',
    description: '',
    logo: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    city: '',
    state: '',
    country: 'IN',
    postalCode: '',
    timezone: 'UTC',
    currency: 'INR',
  });

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/business');
      if (res.ok) {
        const json: BusinessProfile = await res.json();
        setProfile(json);
        setFormData({
          name: json.name || '',
          category: json.category || 'CAFE',
          description: json.description || '',
          logo: json.logo || '',
          phone: json.phone || '',
          email: json.email || '',
          website: json.website || '',
          address: json.address || '',
          city: json.city || '',
          state: json.state || '',
          country: json.country || 'IN',
          postalCode: json.postalCode || '',
          timezone: json.timezone || 'UTC',
          currency: json.currency || 'INR',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Failed to load profile',
          message: 'Unable to retrieve business profile from server.',
        });
      }
    } catch (err) {
      console.error('Failed to fetch business profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [currentBusiness.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast({ type: 'error', title: 'Validation error', message: 'Business name is required.' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          logo: formData.logo.trim() || null,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setProfile((prev) => (prev ? { ...prev, ...updated } : null));
        await refreshAuth();
        addToast({
          type: 'success',
          title: 'Profile updated',
          message: 'Business profile has been updated and audit log recorded.',
        });
      } else {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Update failed');
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: err.message || 'Could not update business profile.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Skeleton height={80} radius="var(--radius-lg)" />
          <Skeleton height={320} radius="var(--radius-lg)" />
          <Skeleton height={240} radius="var(--radius-lg)" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Business Profile"
        description="Manage your business identity, contact information, and operating headquarters."
        actions={
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={16} />
            {saving ? 'Saving Changes...' : 'Save Profile'}
          </Button>
        }
      />

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* 1. General Information Card */}
        <Card style={{ padding: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 var(--space-4)' }}>
            General Information
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Business Name *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. The Roasted Bean Café"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Industry Category
                </label>
                <Select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  options={[
                    { value: 'CAFE', label: 'Café & Bakery' },
                    { value: 'RESTAURANT', label: 'Restaurant & Dining' },
                    { value: 'SALON', label: 'Salon & Spa' },
                    { value: 'GYM', label: 'Gym & Fitness' },
                    { value: 'GAMEZONE', label: 'Gamezone & Fun' },
                    { value: 'RETAIL', label: 'Retail & Boutique' },
                    { value: 'OTHER', label: 'General Local Business' },
                  ]}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Description / Customer Tagline
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description that communicates your vibe and value to customers."
                rows={3}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Business Logo URL
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary-subtle)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {formData.logo ? (
                    <img
                      src={formData.logo}
                      alt="Logo preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {(formData.name || 'B').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    value={formData.logo}
                    onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                    placeholder="https://example.com/logo.png or image data URI"
                  />
                </div>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginTop: '4px' }}>
                Direct link to image file (PNG, JPG, SVG, WebP) or data URI under 500KB.
              </span>
            </div>
          </div>
        </Card>

        {/* 2. Contact Details Card */}
        <Card style={{ padding: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 var(--space-4)' }}>
            Contact & Online Presence
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Public Phone
              </label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Public Email
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="hello@example.com"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Website URL
              </label>
              <Input
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
          </div>
        </Card>

        {/* 3. Address & Regional Card */}
        <Card style={{ padding: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 var(--space-4)' }}>
            Headquarters & Regional Settings
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                Street Address
              </label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="142 Market Street"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  City
                </label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Downtown"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  State / Province
                </label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="California"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Postal Code
                </label>
                <Input
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  placeholder="94105"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Country
                </label>
                <Select
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  options={[
                    { value: 'IN', label: 'India (IN)' },
                    { value: 'US', label: 'United States (US)' },
                    { value: 'GB', label: 'United Kingdom (GB)' },
                    { value: 'CA', label: 'Canada (CA)' },
                    { value: 'AU', label: 'Australia (AU)' },
                  ]}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Default Timezone
                </label>
                <Select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  options={[
                    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
                    { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
                    { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
                    { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
                    { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
                    { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
                    { value: 'Europe/London', label: 'London (GMT / BST)' },
                  ]}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Currency
                </label>
                <Select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  options={[
                    { value: 'INR', label: 'INR (₹ - Indian Rupee)' },
                    { value: 'USD', label: 'USD ($ - US Dollar)' },
                    { value: 'GBP', label: 'GBP (£ - British Pound)' },
                    { value: 'EUR', label: 'EUR (€ - Euro)' },
                  ]}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* 4. Read-Only Platform Metadata Card */}
        {profile && (
          <Card style={{ padding: 'var(--space-6)', backgroundColor: '#F8FAFC' }}>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 var(--space-4)' }}>
              Platform Identity & Security
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Business Handle (Slug)
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-primary)' }}>
                  {profile.slug}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Tenant Status
                </div>
                <StatusBadge status={profile.status.toLowerCase() as any} label={profile.status} />
              </div>

              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Registered Date
                </div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  {new Date(profile.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Onboarding Lifecycle
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: profile.onboardingCompleted ? 'var(--color-success)' : 'var(--color-warning)',
                  }}
                >
                  {profile.onboardingCompleted ? 'Completed' : `In Progress (Step ${profile.onboardingStep})`}
                </span>
              </div>
            </div>
          </Card>
        )}
      </form>
    </PageContainer>
  );
};
