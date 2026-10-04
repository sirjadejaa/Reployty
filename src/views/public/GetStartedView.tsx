import React, { useState } from 'react';
import {
  Award,
  Building2,
  User,
  MapPin,
  Sliders,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Mail,
  Phone,
  Globe,
  Store,
  Sparkles,
} from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Select } from '../../components/ui/Select';
import { BusinessCategory } from '@prisma/client';

export interface GetStartedViewProps {
  onNavigateLogin?: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'CAFE', label: 'Café' },
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'BAKERY', label: 'Bakery' },
  { value: 'SALON', label: 'Salon' },
  { value: 'BEAUTY', label: 'Beauty' },
  { value: 'SPA', label: 'Spa' },
  { value: 'GYM', label: 'Gym' },
  { value: 'GAMEZONE', label: 'Gamezone' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'OTHER', label: 'Other' },
];

export const GetStartedView: React.FC<GetStartedViewProps> = ({ onNavigateLogin }) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string>('');

  // Form Fields
  const [formData, setFormData] = useState({
    businessName: '',
    category: 'CAFE' as BusinessCategory,
    description: '',
    website: '',
    businessPhone: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    country: 'India',
    city: '',
    state: '',
    postalCode: '',
    address: '',
    numberOfBranches: 1,
    themePreset: 'MODERN_CLEAN',
  });

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const validateStep = (step: number): boolean => {
    setError(null);
    if (step === 1) {
      if (!formData.businessName.trim()) {
        setError('Please enter your business name.');
        return false;
      }
      if (!formData.category) {
        setError('Please select a business category.');
        return false;
      }
    } else if (step === 2) {
      if (!formData.ownerName.trim()) {
        setError('Please enter the business owner’s full name.');
        return false;
      }
      if (!formData.ownerEmail.trim()) {
        setError('Please enter a valid owner email address.');
        return false;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.ownerEmail.trim())) {
        setError('Please enter a valid email address format.');
        return false;
      }
      if (!formData.ownerPhone.trim()) {
        setError('Please enter a contact phone number.');
        return false;
      }
    } else if (step === 3) {
      if (!formData.address.trim()) {
        setError('Please provide the street address.');
        return false;
      }
      if (!formData.city.trim()) {
        setError('Please enter the city.');
        return false;
      }
      if (!formData.country.trim()) {
        setError('Please specify the country.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 5));
    }
  };

  const handlePrev = () => {
    setError(null);
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await fetch('/api/public/onboarding-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to submit application');
      }

      setConfirmationMessage(
        json.message ||
          'Thanks — your Reployty setup request has been received. Our team will review your information and prepare your business workspace.'
      );
      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Submission failed. Please check your information and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // SUCCESS CONFIRMATION SCREEN (Section 12 compliant)
  if (isSubmitted) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-6) var(--space-4)',
          backgroundColor: 'var(--color-bg-canvas)',
          background: 'radial-gradient(ellipse at 50% 10%, rgba(79, 107, 255, 0.08) 0%, var(--color-bg-canvas) 70%)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-card-elevated)',
            padding: 'var(--space-8)',
            textAlign: 'center',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: '#ECFDF5',
              color: '#059669',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 'var(--space-4)',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
            }}
          >
            <CheckCircle2 size={32} />
          </div>

          <h2
            style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.02em',
              margin: '0 0 var(--space-3) 0',
            }}
          >
            Application Received
          </h2>

          <p
            style={{
              fontSize: 'var(--font-size-md)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.5,
              margin: '0 0 var(--space-6) 0',
            }}
          >
            {confirmationMessage}
          </p>

          <div
            style={{
              backgroundColor: 'var(--color-bg)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              padding: 'var(--space-4)',
              textAlign: 'left',
              marginBottom: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
              Submission Summary
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
              <strong>Business:</strong> {formData.businessName} ({formData.category})
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
              <strong>Owner:</strong> {formData.ownerName} ({formData.ownerEmail})
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
              <strong>Location:</strong> {formData.city}, {formData.country}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                if (onNavigateLogin) {
                  onNavigateLogin();
                } else {
                  window.location.hash = '';
                }
              }}
              style={{ width: '100%' }}
            >
              Return to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // WIZARD FORM SCREEN
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6) var(--space-4)',
        backgroundColor: 'var(--color-bg-canvas)',
        background: 'radial-gradient(ellipse at 50% 10%, rgba(79, 107, 255, 0.08) 0%, var(--color-bg-canvas) 70%)',
      }}
    >
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-xl)',
            backgroundColor: 'var(--color-primary)',
            color: '#FFFFFF',
            boxShadow: 'var(--shadow-primary-glow)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <Award size={26} strokeWidth={2.5} />
        </div>
        <h1
          style={{
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.025em',
            margin: '0 0 var(--space-1) 0',
          }}
        >
          Get Started with Reployty
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            margin: 0,
          }}
        >
          Let’s get your business workspace set up.
        </p>
      </div>

      {/* Main Form Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 580,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-card-elevated)',
          padding: 'var(--space-6) var(--space-8)',
          boxSizing: 'border-box',
        }}
      >
        {/* Step Indicator */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-6)',
            position: 'relative',
          }}
        >
          {[
            { step: 1, label: 'Business', icon: Building2 },
            { step: 2, label: 'Owner', icon: User },
            { step: 3, label: 'Location', icon: MapPin },
            { step: 4, label: 'Preferences', icon: Sliders },
            { step: 5, label: 'Review', icon: CheckCircle2 },
          ].map(s => {
            const isCompleted = currentStep > s.step;
            const isCurrent = currentStep === s.step;
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: isCurrent
                      ? 'var(--color-primary)'
                      : isCompleted
                      ? '#EEF2FF'
                      : 'var(--color-bg)',
                    color: isCurrent
                      ? '#FFFFFF'
                      : isCompleted
                      ? 'var(--color-primary)'
                      : 'var(--color-text-muted)',
                    border: isCurrent
                      ? '2px solid var(--color-primary)'
                      : isCompleted
                      ? '2px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: 12,
                    transition: 'all 200ms ease',
                  }}
                >
                  <Icon size={14} />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: isCurrent ? 600 : 400,
                    color: isCurrent ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Error Alert Box */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--color-danger-subtle)',
              border: '1px solid var(--color-danger-border)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-5)',
              color: 'var(--color-danger-text)',
              fontSize: 'var(--font-size-sm)',
              lineHeight: 1.4,
            }}
            role="alert"
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* STEP 1: BUSINESS INFORMATION */}
          {currentStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: '0 0 4px 0' }}>
                  1. Your Business
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                  Tell us about your brand and industry.
                </p>
              </div>

              <Input
                id="biz-name"
                label="Business Name *"
                placeholder="e.g. Artisan Roast Coffee"
                value={formData.businessName}
                onChange={e => handleChange('businessName', e.target.value)}
                leftIcon={<Store size={16} />}
                required
              />

              <Select
                id="biz-category"
                label="Category *"
                options={CATEGORY_OPTIONS}
                value={formData.category}
                onChange={e => handleChange('category', e.target.value as BusinessCategory)}
              />

              <Textarea
                id="biz-desc"
                label="Brief Description (Optional)"
                placeholder="Specialty single-origin espresso and artisanal sourdough pastries..."
                value={formData.description}
                onChange={e => handleChange('description', e.target.value)}
                rows={3}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
                <Input
                  id="biz-website"
                  label="Website (Optional)"
                  placeholder="https://artisanroast.com"
                  value={formData.website}
                  onChange={e => handleChange('website', e.target.value)}
                  leftIcon={<Globe size={16} />}
                />
                <Input
                  id="biz-phone"
                  label="Business Phone (Optional)"
                  placeholder="+91 98765 43210"
                  value={formData.businessPhone}
                  onChange={e => handleChange('businessPhone', e.target.value)}
                  leftIcon={<Phone size={16} />}
                />
              </div>
            </div>
          )}

          {/* STEP 2: OWNER INFORMATION */}
          {currentStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: '0 0 4px 0' }}>
                  2. Business Owner Contact
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                  This person will receive the secure setup link to create their workspace password.
                </p>
              </div>

              <Input
                id="owner-name"
                label="Owner Full Name *"
                placeholder="Rahul Sharma"
                value={formData.ownerName}
                onChange={e => handleChange('ownerName', e.target.value)}
                leftIcon={<User size={16} />}
                required
              />

              <Input
                id="owner-email"
                type="email"
                label="Owner Email Address *"
                placeholder="rahul@artisanroast.com"
                value={formData.ownerEmail}
                onChange={e => handleChange('ownerEmail', e.target.value)}
                leftIcon={<Mail size={16} />}
                required
              />

              <Input
                id="owner-phone"
                label="Owner Phone Number *"
                placeholder="+91 98765 43210"
                value={formData.ownerPhone}
                onChange={e => handleChange('ownerPhone', e.target.value)}
                leftIcon={<Phone size={16} />}
                required
              />

              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                }}
              >
                🔒 <strong>Zero password exposure:</strong> You will NOT create a password here. Once Reployty approves and provisions your business, a secure one-time link will be sent to this email to set your password.
              </div>
            </div>
          )}

          {/* STEP 3: LOCATION */}
          {currentStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: '0 0 4px 0' }}>
                  3. Primary Store Location
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                  Where is your main branch or flagship store located?
                </p>
              </div>

              <Input
                id="loc-address"
                label="Street Address *"
                placeholder="104 Indiranagar 100ft Road"
                value={formData.address}
                onChange={e => handleChange('address', e.target.value)}
                leftIcon={<MapPin size={16} />}
                required
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
                <Input
                  id="loc-city"
                  label="City *"
                  placeholder="Bengaluru"
                  value={formData.city}
                  onChange={e => handleChange('city', e.target.value)}
                  required
                />
                <Input
                  id="loc-state"
                  label="State / Province"
                  placeholder="Karnataka"
                  value={formData.state}
                  onChange={e => handleChange('state', e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
                <Input
                  id="loc-country"
                  label="Country *"
                  placeholder="India"
                  value={formData.country}
                  onChange={e => handleChange('country', e.target.value)}
                  required
                />
                <Input
                  id="loc-postal"
                  label="Postal Code"
                  placeholder="560038"
                  value={formData.postalCode}
                  onChange={e => handleChange('postalCode', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 4: PREFERENCES */}
          {currentStep === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: '0 0 4px 0' }}>
                  4. Setup Preferences
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                  Help us configure your initial loyalty & branch capacity.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 6 }}>
                  Number of Outlets / Branches
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {[1, 2, 3, 5, 10].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleChange('numberOfBranches', n)}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: 'var(--radius-md)',
                        border: formData.numberOfBranches === n ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        backgroundColor: formData.numberOfBranches === n ? '#EEF2FF' : 'var(--color-surface)',
                        color: formData.numberOfBranches === n ? 'var(--color-primary)' : 'var(--color-text-primary)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {n === 10 ? '10+' : n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 6 }}>
                  Branding Preset
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
                  {[
                    { id: 'MODERN_CLEAN', label: 'Modern Indigo', color: '#4F6BFF' },
                    { id: 'WARM_ARTISAN', label: 'Warm Artisan', color: '#B45309' },
                    { id: 'EMERALD_FRESH', label: 'Emerald Health', color: '#059669' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleChange('themePreset', t.id)}
                      style={{
                        padding: '12px var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        border: formData.themePreset === t.id ? `2px solid ${t.color}` : '1px solid var(--color-border)',
                        backgroundColor: formData.themePreset === t.id ? 'var(--color-bg)' : 'var(--color-surface)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: t.color }} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW */}
          {currentStep === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: '0 0 4px 0' }}>
                  5. Review Your Submission
                </h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                  Please confirm your details before submitting to Reployty.
                </p>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                  padding: 'var(--space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                    Business
                  </span>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>
                    {formData.businessName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {formData.category} • {formData.numberOfBranches} {formData.numberOfBranches === 1 ? 'branch' : 'branches'}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                    Owner
                  </span>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
                    {formData.ownerName}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {formData.ownerEmail} • {formData.ownerPhone}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                    Address
                  </span>
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                    {formData.address}, {formData.city}, {formData.country}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 'var(--space-6)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            {currentStep > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handlePrev}
                leftIcon={<ArrowLeft size={16} />}
              >
                Back
              </Button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (onNavigateLogin) {
                    onNavigateLogin();
                  } else {
                    window.location.hash = '';
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                }}
              >
                Existing account? Sign in
              </button>
            )}

            {currentStep < 5 ? (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleNext}
                rightIcon={<ArrowRight size={16} />}
              >
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isSubmitting}
                rightIcon={<Sparkles size={16} />}
              >
                Submit Application
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
