import React, { useState, useEffect } from 'react';
import {
  Save,
  Check,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTenant } from '../../context/TenantContext';
import { useToast } from '../../context/ToastContext';
import { AdminRoute } from '../../types/loyalty';
import { CATEGORY_THEME_PRESETS } from '../../types/theme';
import { BrandingConfig } from '../../types/business';
import { DigitalLoyaltyCard } from '../../components/loyalty/DigitalLoyaltyCard';

export interface BrandingViewProps {
  onNavigate?: (route: AdminRoute) => void;
}

export const BrandingView: React.FC<BrandingViewProps> = () => {
  const { currentBusiness } = useTenant();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('CAFE');
  const [primaryColor, setPrimaryColor] = useState<string>('#4F6BFF');
  const [secondaryColor, setSecondaryColor] = useState<string>('#111827');
  const [previewProgramType, setPreviewProgramType] = useState<'STAMP' | 'POINTS'>('STAMP');

  const fetchBranding = async () => {
    try {
      const res = await fetch('/api/business/branding');
      if (res.ok) {
        const json: BrandingConfig = await res.json();
        setSelectedPreset(json.themePreset || 'CAFE');
        setPrimaryColor(json.primaryColor || '#4F6BFF');
        setSecondaryColor(json.secondaryColor || '#111827');
      }
    } catch (err) {
      console.error('Failed to fetch branding:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, [currentBusiness.id]);

  const handleSelectPreset = (key: string) => {
    const preset = (CATEGORY_THEME_PRESETS as any)[key.toLowerCase()];
    if (preset) {
      setSelectedPreset(key.toUpperCase());
      setPrimaryColor(preset.theme.primaryColor);
      setSecondaryColor(preset.theme.secondaryColor);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/business/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themePreset: selectedPreset,
          primaryColor,
          secondaryColor,
        }),
      });

      if (res.ok) {
        addToast({
          type: 'success',
          title: 'Branding saved',
          message: 'Your theme preset and brand colors have been updated.',
        });
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update branding');
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save failed',
        message: err.message || 'Could not update branding.',
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
          <Skeleton height={280} radius="var(--radius-lg)" />
          <Skeleton height={200} radius="var(--radius-lg)" />
        </div>
      </PageContainer>
    );
  }

  const activePresetConfig = (CATEGORY_THEME_PRESETS as any)[selectedPreset.toLowerCase()] || CATEGORY_THEME_PRESETS.cafe;

  return (
    <PageContainer>
      <PageHeader
        title="Business Branding & Theme"
        description="Configure the visual identity, theme preset, and accent palette for your customer-facing loyalty passes."
        actions={
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={16} />
            {saving ? 'Saving Branding...' : 'Save Branding'}
          </Button>
        }
      />

      <div className="responsive-two-col">
        {/* Left Column: Preset Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Card style={{ padding: 'var(--space-5)' }}>
            <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: '0 0 var(--space-3)' }}>
              Select Industry Theme Preset
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-4)' }}>
              Controlled design tokens ensure consistent legibility, contrast, and visual harmony across customer mobile passes.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {Object.entries(CATEGORY_THEME_PRESETS).map(([key, preset]) => {
                const isSelected = selectedPreset.toLowerCase() === key.toLowerCase();
                return (
                  <div
                    key={key}
                    onClick={() => handleSelectPreset(key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid var(--color-primary)' : '1px solid #E2E8F0',
                      backgroundColor: isSelected ? '#F5F7FF' : '#FFFFFF',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          backgroundColor: preset.theme.primaryColor,
                          border: '2px solid #FFFFFF',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                        }}
                      />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {preset.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {preset.description}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-primary)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={14} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column: Live Interactive Card Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Card style={{ padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
                Live Digital Loyalty Card Preview
              </h2>
              {/* Interactive Stamp / Points toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#F1F5F9',
                  padding: '3px',
                  borderRadius: '8px',
                  gap: '2px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setPreviewProgramType('STAMP')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: previewProgramType === 'STAMP' ? '#FFFFFF' : 'transparent',
                    color: previewProgramType === 'STAMP' ? '#0F172A' : '#64748B',
                    boxShadow: previewProgramType === 'STAMP' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Stamp Pass
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewProgramType('POINTS')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: previewProgramType === 'POINTS' ? '#FFFFFF' : 'transparent',
                    color: previewProgramType === 'POINTS' ? '#0F172A' : '#64748B',
                    boxShadow: previewProgramType === 'POINTS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Points Pass
                </button>
              </div>
            </div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-4)' }}>
              Real-time rendering of your customer-facing digital loyalty card with active preset luxury gradients and tokens.
            </p>

            <DigitalLoyaltyCard
              businessName={currentBusiness.name}
              businessLogo={currentBusiness.themeConfig?.logo || (currentBusiness as any).logo}
              businessCategory={currentBusiness.category}
              branchName="Main Branch"
              programName={previewProgramType === 'STAMP' ? '10-Stamp Rewards Pass' : 'Exclusive VIP Points'}
              programType={previewProgramType}
              targetStamps={10}
              currentStamps={6}
              pointsBalance={1450}
              pointsConversionLabel="1 pt per ₹10 spent"
              rewardTitle={previewProgramType === 'STAMP' ? 'Free Specialty Drink' : '₹150 Off Next Order'}
              customerName="Alex Rivera"
              customerPhone="+1 •••• ••2834"
              cardStatus="ACTIVE"
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              themePreset={selectedPreset}
              isPreview={true}
            />

            {/* Token details breakdown */}
            <div
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <span>Preset: <strong>{activePresetConfig.name}</strong></span>
              <span>Primary: <code style={{ color: primaryColor, fontWeight: 700 }}>{primaryColor}</code></span>
              <span>Secondary: <code style={{ color: secondaryColor, fontWeight: 700 }}>{secondaryColor}</code></span>
            </div>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
};
