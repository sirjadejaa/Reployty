import React, { useState, useEffect, useCallback } from 'react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { QrCode, Clock, RotateCcw, Sparkles } from 'lucide-react';
import { CustomerLoyaltyState } from '../../types/customer';
import { DigitalLoyaltyCard } from '../../components/loyalty/DigitalLoyaltyCard';

export const CustomerLoyaltyView: React.FC = () => {
  const { customer, business, branch } = useCustomerAuth();
  const [loyaltyData, setLoyaltyData] = useState<CustomerLoyaltyState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLoyaltyState = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/customer/loyalty');
      if (res.ok) {
        const data = await res.json();
        setLoyaltyData(data);
      } else {
        throw new Error('Failed to load loyalty pass');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to connect to loyalty service');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoyaltyState();
  }, [fetchLoyaltyState]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
        <div style={{ height: '24px', width: '60%', backgroundColor: '#E2E8F0', borderRadius: '6px' }} />
        <div style={{ height: '260px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '20px' }} />
        <div style={{ height: '180px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '16px' }} />
      </div>
    );
  }

  const hasProgram = Boolean(loyaltyData?.hasActiveProgram && loyaltyData.program);
  const targetStamps = loyaltyData?.progress?.targetStamps || loyaltyData?.card?.totalStampsNeeded || 10;
  const stampsCollected = loyaltyData?.progress?.currentStamps || loyaltyData?.card?.stampsCollected || 0;
  const pointsBalance = loyaltyData?.progress?.currentPoints ?? loyaltyData?.card?.pointsBalance ?? customer?.pointsBalance ?? 0;

  // Prefer server-authoritative business and customer objects from loyalty payload with fallback to auth context
  const activeBusinessName = loyaltyData?.business?.name || business?.name || 'Reployty Partner';
  const activeBusinessLogo = loyaltyData?.business?.logo || business?.logo;
  const activeBusinessCategory = loyaltyData?.business?.category || business?.category || 'cafe';
  const activeBranchName = loyaltyData?.customer?.branch?.name || branch?.name;
  const activeCustomerName = loyaltyData?.customer?.name || customer?.name || 'Valued Customer';
  const activeCustomerPhone = loyaltyData?.customer?.phone || customer?.phone;
  const activePrimaryColor = loyaltyData?.business?.primaryColor || business?.primaryColor;
  const activeSecondaryColor = loyaltyData?.business?.secondaryColor || business?.secondaryColor;
  const activeThemePreset = loyaltyData?.business?.themePreset || business?.themePreset || 'CAFE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* View Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0', letterSpacing: '-0.01em' }}>
            Loyalty & Rewards Pass
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
            Your digital membership pass for {activeBusinessName}.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchLoyaltyState}
          title="Refresh Pass"
          style={{
            padding: '8px',
            borderRadius: '10px',
            backgroundColor: '#F1F5F9',
            border: 'none',
            color: '#475569',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {!hasProgram ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '36px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: '#EEF2FF', color: '#4F6BFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Sparkles size={24} />
          </div>
          <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
            Loyalty isn't active yet
          </h2>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5, maxWidth: '320px', marginLeft: 'auto', marginRight: 'auto' }}>
            This business hasn't enabled a loyalty program for your account. Keep visiting to earn rewards as soon as it launches!
          </p>
        </div>
      ) : (
        /* Real Digital Loyalty Card */
        <DigitalLoyaltyCard
          businessName={activeBusinessName}
          businessLogo={activeBusinessLogo}
          businessCategory={activeBusinessCategory}
          branchName={activeBranchName}
          programName={loyaltyData?.program?.name || 'Digital Loyalty Pass'}
          programType={loyaltyData?.program?.type === 'POINTS' ? 'POINTS' : 'STAMP'}
          targetStamps={targetStamps}
          currentStamps={stampsCollected}
          pointsBalance={pointsBalance}
          pointsConversionLabel={loyaltyData?.progress?.pointsConversionLabel}
          rewardTitle={loyaltyData?.program?.rewardTitle || 'Exclusive Reward'}
          customerName={activeCustomerName}
          customerPhone={activeCustomerPhone}
          cardStatus={(loyaltyData?.card?.status as any) || 'ACTIVE'}
          primaryColor={activePrimaryColor}
          secondaryColor={activeSecondaryColor}
          themePreset={activeThemePreset}
        />
      )}

      {/* Member QR / Barcode Card */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '8px', color: '#64748B', fontSize: '12px', fontWeight: 600 }}>
          <QrCode size={16} /> MEMBER IDENTIFICATION PASS
        </div>
        <div
          style={{
            display: 'inline-block',
            padding: '16px',
            backgroundColor: '#F8FAFC',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            margin: '8px 0',
          }}
        >
          <div
            style={{
              width: 140,
              height: 140,
              backgroundColor: '#0F172A',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              gap: '6px',
            }}
          >
            <QrCode size={48} />
            <span style={{ fontSize: '10px', letterSpacing: '0.08em', opacity: 0.8 }}>REPLOYTY PASS</span>
          </div>
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
          {activeCustomerPhone || customer?.phone || 'Customer Pass'}
        </div>
        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
          Show this code to counter staff when ordering to collect stamps & points.
        </div>
      </div>

      {/* Recent Loyalty Transactions Section */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Clock size={16} color="#64748B" />
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
            Recent Loyalty Activity
          </span>
        </div>

        {loyaltyData?.recentTransactions && loyaltyData.recentTransactions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loyaltyData.recentTransactions.map((tx) => (
              <div
                key={tx.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#F8FAFC',
                  fontSize: '13px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>
                    {tx.type === 'STAMP_ADDED' ? 'Stamp Earned' : tx.type === 'POINTS_EARNED' ? 'Points Earned' : 'Balance Adjusted'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {new Date(tx.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {tx.branch?.name ? ` • ${tx.branch.name}` : ''}
                  </div>
                </div>

                <div style={{ fontWeight: 700, color: tx.deltaStamps > 0 || tx.deltaPoints > 0 ? '#16A34A' : '#DC2626' }}>
                  {tx.deltaStamps > 0 ? `+${tx.deltaStamps} Stamp` : tx.deltaPoints > 0 ? `+${tx.deltaPoints} Pts` : `${tx.deltaStamps || tx.deltaPoints}`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 8px', color: '#94A3B8', fontSize: '13px' }}>
            No recent activity yet. Your stamps and points history will appear here.
          </div>
        )}
      </div>
    </div>
  );
};
