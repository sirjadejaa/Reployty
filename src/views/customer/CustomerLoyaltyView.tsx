import React, { useState, useEffect, useCallback } from 'react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { Clock, RotateCcw, Sparkles } from 'lucide-react';
import { CustomerLoyaltyState } from '../../types/customer';
import { DigitalLoyaltyCard } from '../../components/loyalty/DigitalLoyaltyCard';
import { MemberIdentificationPass } from '../../components/customer/MemberIdentificationPass';

export interface CustomerLoyaltyViewProps {
  qrToken?: string;
  businessId?: string;
  onEnroll?: () => void;
}

export const CustomerLoyaltyView: React.FC<CustomerLoyaltyViewProps> = ({
  qrToken,
  businessId,
  onEnroll,
}) => {
  const { customer, business, branch, getSessionToken } = useCustomerAuth();
  const [loyaltyData, setLoyaltyData] = useState<CustomerLoyaltyState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetBizId = businessId || business?.id;

  const fetchLoyaltyState = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = getSessionToken(targetBizId);
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const query = qrToken ? `?qr=${encodeURIComponent(qrToken)}` : '';
      const res = await fetch(`/api/customer/loyalty${query}`, { headers });
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
  }, [qrToken, targetBizId, getSessionToken]);

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
  const isEnrolled = loyaltyData?.isEnrolled !== false && !loyaltyData?.requiresEnrollment && Boolean(loyaltyData?.customer);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Creative Compact Mini-Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              backgroundColor: `${activePrimaryColor}15`,
              color: activePrimaryColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>
              Digital Pass
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
              Present QR code at checkout
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchLoyaltyState}
          title="Refresh Pass"
          style={{
            padding: '7px',
            borderRadius: '8px',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            color: '#64748B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RotateCcw size={15} />
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
      ) : !isEnrolled ? (
        <>
          {/* Preview Digital Loyalty Card for Scanned Business */}
          <DigitalLoyaltyCard
            businessName={activeBusinessName}
            businessLogo={activeBusinessLogo}
            businessCategory={activeBusinessCategory}
            branchName={activeBranchName}
            programName={loyaltyData?.program?.name || 'Digital Loyalty Pass'}
            programType={loyaltyData?.program?.type === 'POINTS' ? 'POINTS' : 'STAMP'}
            targetStamps={targetStamps}
            currentStamps={0}
            pointsBalance={0}
            pointsConversionLabel={loyaltyData?.progress?.pointsConversionLabel}
            rewardTitle={loyaltyData?.program?.rewardTitle || 'Exclusive Regular Reward'}
            customerName="Guest Preview"
            customerPhone={undefined}
            cardStatus="ACTIVE"
            primaryColor={activePrimaryColor}
            secondaryColor={activeSecondaryColor}
            themePreset={activeThemePreset}
            isPreview={true}
          />

          {/* Business-Specific Enrollment Callout */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              padding: '24px 20px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                backgroundColor: `${activePrimaryColor}15`,
                color: activePrimaryColor,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              <Sparkles size={24} />
            </div>
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
              Join {activeBusinessName}'s Loyalty Program
            </h3>
            <p
              style={{
                fontSize: '13px',
                color: '#64748B',
                margin: '0 0 18px 0',
                lineHeight: 1.5,
                maxWidth: '320px',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Collect {loyaltyData?.program?.type === 'POINTS' ? 'points' : 'stamps'} and unlock {loyaltyData?.program?.rewardTitle || 'exclusive rewards'} with every visit. Sign up with your mobile number in seconds!
            </p>
            {onEnroll && (
              <button
                type="button"
                onClick={onEnroll}
                style={{
                  width: '100%',
                  maxWidth: '300px',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  backgroundColor: activePrimaryColor,
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '14px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                }}
              >
                Enroll with Mobile Phone
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Real Digital Loyalty Card */}
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

          {/* Real Member Identification Pass */}
          <MemberIdentificationPass
            customerPhone={activeCustomerPhone || customer?.phone}
            customerId={loyaltyData?.customer?.id || customer?.id}
            customerName={activeCustomerName}
            businessName={activeBusinessName}
            businessLogo={activeBusinessLogo}
            primaryColor={activePrimaryColor}
            cardStatus={(loyaltyData?.card?.status as any) || 'ACTIVE'}
            showInstructions={true}
          />

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
        </>
      )}
    </div>
  );
};
