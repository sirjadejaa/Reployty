import React, { useState, useEffect } from 'react';
import {
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Coffee,
  Utensils,
  Scissors,
  Dumbbell,
  Gamepad2,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { Skeleton } from '../components/ui/Skeleton';
import { useTenant } from '../context/TenantContext';
import { useToast } from '../context/ToastContext';
import { AdminRoute } from '../types/loyalty';
import { CATEGORY_THEME_PRESETS } from '../types/theme';

export interface OnboardingViewProps {
  onNavigate: (route: AdminRoute) => void;
}

const CATEGORIES = [
  { id: 'CAFE', name: 'Café & Bakery', icon: Coffee, desc: 'Coffee shops, artisanal bakeries, tea rooms' },
  { id: 'RESTAURANT', name: 'Restaurant & Dining', icon: Utensils, desc: 'Casual dining, fine restaurants, bistros' },
  { id: 'SALON', name: 'Salon & Spa', icon: Scissors, desc: 'Hair salons, nail studios, day spas' },
  { id: 'GYM', name: 'Gym & Fitness', icon: Dumbbell, desc: 'Fitness centers, yoga studios, crossfit' },
  { id: 'GAMEZONE', name: 'Gamezone & Fun', icon: Gamepad2, desc: 'Arcades, escape rooms, bowling alleys' },
  { id: 'RETAIL', name: 'Retail & Boutique', icon: ShoppingBag, desc: 'Clothing boutiques, specialty goods' },
  { id: 'OTHER', name: 'Local Business', icon: Store, desc: 'Service businesses, clinics, repair shops' },
];

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onNavigate }) => {
  const { currentBusiness } = useTenant();
  const { addToast } = useToast();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Info
    name: '',
    description: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    city: '',
    state: '',
    country: 'US',
    postalCode: '',
    // Step 2: Category
    category: 'CAFE',
    // Step 3: First Branch
    branchName: 'Downtown Flagship',
    branchAddress: '',
    branchCity: '',
    branchPhone: '',
    branchTimezone: 'UTC',
    // Step 4: Branding
    themePreset: 'CAFE',
    primaryColor: '#4F6BFF',
    // Step 5: Staff
    staffName: '',
    staffEmail: '',
    staffRoleId: '',
  });

  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);

  // Load existing onboarding state from PostgreSQL
  useEffect(() => {
    const loadState = async () => {
      try {
        const [onboardRes, rolesRes] = await Promise.all([
          fetch('/api/business/onboarding'),
          fetch('/api/business/roles'),
        ]);

        if (onboardRes.ok) {
          const onboard = await onboardRes.json();
          setFormData((prev) => ({
            ...prev,
            name: onboard.name || '',
            description: onboard.description || '',
            phone: onboard.phone || '',
            email: onboard.email || '',
            website: onboard.website || '',
            address: onboard.address || '',
            city: onboard.city || '',
            state: onboard.state || '',
            country: onboard.country || 'US',
            postalCode: onboard.postalCode || '',
            category: onboard.category || 'CAFE',
            themePreset: onboard.themePreset || 'CAFE',
            primaryColor: onboard.primaryColor || '#4F6BFF',
            branchName: onboard.branches?.[0]?.name || 'Downtown Flagship',
            branchAddress: onboard.branches?.[0]?.address || onboard.address || '',
            branchCity: onboard.branches?.[0]?.city || onboard.city || '',
            branchPhone: onboard.branches?.[0]?.phone || onboard.phone || '',
            branchTimezone: onboard.branches?.[0]?.timezone || 'UTC',
          }));

          if (onboard.onboardingStep && onboard.onboardingStep <= 6) {
            setCurrentStep(onboard.onboardingStep);
          }
        }

        if (rolesRes.ok) {
          const rolesJson = await rolesRes.json();
          setRoles(rolesJson);
          const staffRole = rolesJson.find((r: any) => r.name === 'STAFF') || rolesJson[0];
          if (staffRole) {
            setFormData((prev) => ({ ...prev, staffRoleId: staffRole.id }));
          }
        }
      } catch (err) {
        console.error('Failed to load onboarding state:', err);
      } finally {
        setLoading(false);
      }
    };

    loadState();
  }, [currentBusiness.id]);

  const saveStepProgress = async (nextStep: number, isFinal = false) => {
    setSaving(true);
    try {
      // 1. Persist step progress
      await fetch('/api/business/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: nextStep,
          completed: isFinal,
        }),
      });

      // 2. Perform step-specific database updates
      if (currentStep === 1) {
        await fetch('/api/business', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            phone: formData.phone,
            email: formData.email,
            website: formData.website,
            address: formData.address,
            city: formData.city,
            state: formData.state,
            country: formData.country,
            postalCode: formData.postalCode,
          }),
        });
      } else if (currentStep === 2) {
        await fetch('/api/business', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: formData.category,
          }),
        });
      } else if (currentStep === 3) {
        // Create first branch if not exists
        await fetch('/api/business/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.branchName || `${formData.name} Main Branch`,
            address: formData.branchAddress || formData.address,
            city: formData.branchCity || formData.city,
            phone: formData.branchPhone || formData.phone,
            timezone: formData.branchTimezone,
            isMainBranch: true,
          }),
        });
      } else if (currentStep === 4) {
        await fetch('/api/business/branding', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            themePreset: formData.themePreset,
            primaryColor: formData.primaryColor,
          }),
        });
      } else if (currentStep === 5 && formData.staffEmail && formData.staffName) {
        await fetch('/api/business/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.staffName,
            email: formData.staffEmail,
            roleId: formData.staffRoleId,
          }),
        });
      }

      setCurrentStep(nextStep);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Step save failed',
        message: err.message || 'Please check your inputs.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: '60px auto', padding: '0 20px' }}>
        <Skeleton height={400} radius="var(--radius-lg)" />
      </div>
    );
  }

  const STEPS = [
    { num: 1, label: 'Business' },
    { num: 2, label: 'Category' },
    { num: 3, label: 'Branch' },
    { num: 4, label: 'Branding' },
    { num: 5, label: 'Staff' },
    { num: 6, label: 'Complete' },
  ];

  return (
    <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px 80px' }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            borderRadius: '20px',
            backgroundColor: 'var(--color-primary-soft)',
            color: 'var(--color-primary)',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '12px',
          }}
        >
          <Sparkles size={14} /> Reployty Workspace Setup
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Let's get your business workspace ready
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: 0 }}>
          Configure your operational details, branch location, theme, and team.
        </p>
      </div>

      {/* Stepper Indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          marginBottom: '36px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '24px',
            right: '24px',
            height: '2px',
            backgroundColor: '#E2E8F0',
            zIndex: 0,
          }}
        />
        {STEPS.map((s) => {
          const isDone = s.num < currentStep;
          const isCurrent = s.num === currentStep;
          return (
            <div
              key={s.num}
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: isDone ? 'var(--color-success)' : isCurrent ? 'var(--color-primary)' : '#FFFFFF',
                  color: isDone || isCurrent ? '#FFFFFF' : 'var(--color-text-muted)',
                  border: isDone || isCurrent ? 'none' : '2px solid #E2E8F0',
                  transition: 'all 0.2s ease',
                }}
              >
                {isDone ? <Check size={16} strokeWidth={3} /> : s.num}
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step Content Card */}
      <Card style={{ padding: '32px', border: '1px solid var(--color-border-subtle)', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
        {/* STEP 1: Business Information */}
        {currentStep === 1 && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Step 1: Business Information
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
              Enter your public business details. These will be shown on digital reward passes.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                  Short Tagline / Description
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. Craft coffee, fresh pastries & cozy vibes."
                  rows={2}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Contact Phone
                  </label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Business Email
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contact@example.com"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Primary Address
                </label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="142 Market Street"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
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
                    State
                  </label>
                  <Input
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="CA"
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
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Business Category */}
        {currentStep === 2 && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Step 2: Business Category
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
              Select your primary industry category. This tailors the theme and customer experience.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
              {CATEGORIES.map((cat) => {
                const IconComponent = cat.icon;
                const isSelected = formData.category === cat.id;
                return (
                  <div
                    key={cat.id}
                    onClick={() => {
                      setFormData({
                        ...formData,
                        category: cat.id,
                        themePreset: cat.id,
                      });
                    }}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid var(--color-primary)' : '1px solid #E2E8F0',
                      backgroundColor: isSelected ? '#F5F7FF' : '#FFFFFF',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '8px',
                        backgroundColor: isSelected ? 'var(--color-primary)' : '#F1F5F9',
                        color: isSelected ? '#FFFFFF' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconComponent size={20} />
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {cat.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                      {cat.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3: Branch Setup */}
        {currentStep === 3 && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Step 3: First Branch Location
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
              Reployty organizes operations by branch. Set up your flagship or first physical location.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Branch Name *
                </label>
                <Input
                  value={formData.branchName}
                  onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                  placeholder="e.g. Downtown Flagship"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Branch Street Address
                </label>
                <Input
                  value={formData.branchAddress}
                  onChange={(e) => setFormData({ ...formData, branchAddress: e.target.value })}
                  placeholder="142 Market Street, Downtown"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    City / Neighborhood
                  </label>
                  <Input
                    value={formData.branchCity}
                    onChange={(e) => setFormData({ ...formData, branchCity: e.target.value })}
                    placeholder="Downtown"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Branch Phone
                  </label>
                  <Input
                    value={formData.branchPhone}
                    onChange={(e) => setFormData({ ...formData, branchPhone: e.target.value })}
                    placeholder="+1 (555) 234-5678"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Operating Timezone
                </label>
                <Select
                  value={formData.branchTimezone}
                  onChange={(e) => setFormData({ ...formData, branchTimezone: e.target.value })}
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
            </div>
          </div>
        )}

        {/* STEP 4: Branding & Theme Presets */}
        {currentStep === 4 && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Step 4: Branding & Theme Preset
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
              Choose a design aesthetic tailored to your industry. This sets colors and accents.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              {Object.entries(CATEGORY_THEME_PRESETS).map(([key, preset]) => {
                const isSelected = formData.themePreset.toLowerCase() === key.toLowerCase();
                return (
                  <div
                    key={key}
                    onClick={() => {
                      setFormData({
                        ...formData,
                        themePreset: key.toUpperCase(),
                        primaryColor: preset.theme.primaryColor,
                      });
                    }}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid var(--color-primary)' : '1px solid #E2E8F0',
                      backgroundColor: isSelected ? '#F5F7FF' : '#FFFFFF',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          backgroundColor: preset.theme.primaryColor,
                          border: '2px solid #FFFFFF',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {preset.name}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                      {preset.description}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Preview Sample */}
            <div
              style={{
                padding: '16px',
                borderRadius: '10px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                Preview: Digital Pass Accent
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: formData.primaryColor,
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                <Sparkles size={16} /> Collect Stamp • {formData.name || 'Your Business'}
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Staff Setup */}
        {currentStep === 5 && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Step 5: Add Team Member (Optional)
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
              Invite a manager or cashier to your business workspace. You can also skip this and add team members later.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Team Member Name
                </label>
                <Input
                  value={formData.staffName}
                  onChange={(e) => setFormData({ ...formData, staffName: e.target.value })}
                  placeholder="e.g. Sarah Jenkins"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Team Member Email
                </label>
                <Input
                  type="email"
                  value={formData.staffEmail}
                  onChange={(e) => setFormData({ ...formData, staffEmail: e.target.value })}
                  placeholder="sarah@example.com"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Assigned Role
                </label>
                <Select
                  value={formData.staffRoleId}
                  onChange={(e) => setFormData({ ...formData, staffRoleId: e.target.value })}
                  options={roles.map((r) => ({
                    value: r.id,
                    label: `${r.name} — ${r.name === 'MANAGER' ? 'Full branch management' : 'Counter staff & stamps'}`,
                  }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: Complete */}
        {currentStep === 6 && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                color: '#16A34A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <CheckCircle2 size={36} strokeWidth={2.5} />
            </div>

            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Your Reployty workspace is ready!
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', maxWidth: 440, margin: '0 auto 28px', lineHeight: 1.5 }}>
              Your business profile, first branch location, branding preset, and team roster are configured.
            </p>

            <div
              style={{
                maxWidth: 360,
                margin: '0 auto 32px',
                textAlign: 'left',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                padding: '16px 20px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                <Check size={16} color="var(--color-success)" />
                <span>Business Profile & Address</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                <Check size={16} color="var(--color-success)" />
                <span>Category: {formData.category}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                <Check size={16} color="var(--color-success)" />
                <span>Branch: {formData.branchName || 'Downtown Flagship'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                <Check size={16} color="var(--color-success)" />
                <span>Theme Preset: {formData.themePreset}</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={() => onNavigate('dashboard')}
              style={{ padding: '0 32px' }}
            >
              Go to Dashboard
            </Button>
          </div>
        )}

        {/* Navigation Footer Buttons */}
        {currentStep < 6 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '32px',
              paddingTop: '20px',
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            <div>
              {currentStep > 1 && (
                <Button
                  variant="secondary"
                  onClick={() => setCurrentStep(currentStep - 1)}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={16} /> Back
                </Button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Button
                variant="ghost"
                onClick={() => onNavigate('dashboard')}
                disabled={saving}
              >
                Save & Exit
              </Button>
              <Button
                variant="primary"
                onClick={() => saveStepProgress(currentStep + 1, currentStep === 5)}
                disabled={saving || (currentStep === 1 && !formData.name.trim())}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {saving ? 'Saving...' : currentStep === 5 ? 'Finish Setup' : 'Continue'}
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
