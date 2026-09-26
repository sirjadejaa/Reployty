import React, { useState } from 'react';
import {
  QrCode,
  Clock,
  Phone,
} from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LoyaltyCard } from '../components/loyalty/LoyaltyCard';
import { useTenant } from '../context/TenantContext';
import { BusinessCategory } from '../types/tenant';
import { CATEGORY_THEME_PRESETS } from '../types/theme';

export const CustomerPreviewView: React.FC = () => {
  const { currentBusiness } = useTenant();
  const [activeCategory, setActiveCategory] = useState<BusinessCategory>(currentBusiness.category);
  const [stampsCount, setStampsCount] = useState(7);

  const currentThemePreset = CATEGORY_THEME_PRESETS[activeCategory] || CATEGORY_THEME_PRESETS.cafe;

  const CATEGORY_DETAILS: Record<
    BusinessCategory,
    { title: string; reward: string; address: string; phone: string }
  > = {
    cafe: {
      title: 'The Roasted Bean Café',
      reward: 'Free Specialty Coffee or Pastry',
      address: '142 Market Street, Downtown',
      phone: '+1 (555) 234-5678',
    },
    restaurant: {
      title: 'Tuscan Table Bistro',
      reward: 'Complimentary Antipasto or Dessert',
      address: '22 Riverfront Lane',
      phone: '+1 (555) 567-8901',
    },
    salon: {
      title: 'Luxe & Glow Beauty Bar',
      reward: 'Free Deluxe Hair Treatment or Polish',
      address: '58 Pearl Boulevard, Suite B',
      phone: '+1 (555) 345-6789',
    },
    gym: {
      title: 'Iron Pulse Fitness',
      reward: 'Free Protein Smoothie & Guest Pass',
      address: '900 Metro Parkway, Westside',
      phone: '+1 (555) 456-7890',
    },
    gamezone: {
      title: 'Pixel Arena & VR Lounge',
      reward: '1 Hour Free VR Play or 100 Tokens',
      address: '77 Neon Boulevard',
      phone: '+1 (555) 890-1234',
    },
    retail: {
      title: 'Avenue Apparel & Goods',
      reward: '$20 Off Next Apparel Purchase',
      address: '304 Fashion Avenue',
      phone: '+1 (555) 678-9012',
    },
    other: {
      title: 'Corner Goods Local',
      reward: '15% Off Total Order',
      address: '10 Main Street',
      phone: '+1 (555) 111-2222',
    },
  };

  const details = CATEGORY_DETAILS[activeCategory] || CATEGORY_DETAILS.cafe;

  return (
    <PageContainer>
      <PageHeader
        title="Customer Mobile Experience Preview"
        description="This is what your customers see when scanning your store counter QR code. The Reployty Theme Engine automatically applies category branding tokens."
      />

      {/* Theme Engine Category Selector */}
      <Card
        title="Theme Engine Category Switcher"
        subtitle="Switch categories to see how the single component architecture dynamically consumes controlled theme tokens without separate codebases"
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {(Object.keys(CATEGORY_THEME_PRESETS) as BusinessCategory[]).map(catKey => {
            const preset = CATEGORY_THEME_PRESETS[catKey];
            const isSelected = activeCategory === catKey;
            return (
              <Button
                key={catKey}
                variant={isSelected ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(catKey)}
                style={{
                  borderColor: isSelected ? undefined : 'var(--color-border)',
                }}
              >
                {preset.name}
              </Button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
          }}
        >
          <div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Active Theme:
            </span>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginLeft: 6 }}>
              {currentThemePreset.name} — {currentThemePreset.description}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Simulate Stamps:
            </span>
            {[3, 7, 9, 10].map(count => (
              <Button
                key={count}
                variant={stampsCount === count ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setStampsCount(count)}
              >
                {count} / 10
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Interactive Mobile Device Frame */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--space-6) 0',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 36,
            border: '8px solid #1E293B',
            boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
            backgroundColor: '#F8FAFC',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          data-category-theme={activeCategory}
        >
          {/* Mock Phone Status Bar */}
          <div
            style={{
              height: 24,
              backgroundColor: '#1E293B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 18px',
              color: '#94A3B8',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            <span>9:41</span>
            <div style={{ width: 44, height: 4, borderRadius: 4, backgroundColor: '#334155' }} />
            <span>5G 100%</span>
          </div>

          {/* Customer Pass Viewport Content */}
          <div
            style={{
              padding: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              maxHeight: '620px',
              overflowY: 'auto',
            }}
          >
            {/* Top Store Header */}
            <div style={{ textAlign: 'center', padding: 'var(--space-2) 0' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--theme-primary, var(--color-primary))',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Reployty Digital Wallet Pass
              </span>
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                {details.title}
              </h2>
              <p style={{ fontSize: 12, color: '#64748B' }}>{details.address}</p>
            </div>

            {/* Controlled Loyalty Stamp Card Component */}
            <LoyaltyCard
              businessName={details.title}
              category={activeCategory}
              customerName="Jordan Miller"
              stampsCollected={stampsCount}
              totalStampsNeeded={10}
              rewardTitle={details.reward}
              tier={stampsCount >= 8 ? 'VIP Regular' : 'Silver Regular'}
              pointsBalance={stampsCount * 45}
            />

            {/* In-Store Counter Action Bar */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 'var(--radius-card)',
                padding: 'var(--space-4)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>
                Present at Checkout
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg)',
                  border: '1px dashed var(--color-border)',
                }}
              >
                <QrCode size={48} color="#0F172A" />
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, display: 'block' }}>
                    Pass ID: #REP-8831
                  </span>
                  <span style={{ fontSize: 10, color: '#64748B' }}>Tap to scan with cashier</span>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--theme-primary, var(--color-primary))',
                }}
              >
                Collect Stamp Now
              </Button>
            </div>

            {/* Business Contact & Hours */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 'var(--radius-card)',
                padding: 'var(--space-4)',
                border: '1px solid var(--color-border)',
                fontSize: 12,
                color: '#64748B',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} color="#94A3B8" />
                <span>Open today: 7:00 AM – 8:00 PM</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Phone size={14} color="#94A3B8" />
                <span>{details.phone}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
