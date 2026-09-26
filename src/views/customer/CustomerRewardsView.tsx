import React, { useState, useEffect, useCallback } from 'react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import {
  Gift,
  Award,
  Coins,
  QrCode,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { CustomerRewardEvaluation } from '../../types/loyalty';
import { CustomerClaimedRedemption } from '../../types/customer';

interface CustomerRewardsViewProps {
  onNavigateTab?: (tab: 'home' | 'loyalty' | 'rewards' | 'activity' | 'profile') => void;
}

export const CustomerRewardsView: React.FC<CustomerRewardsViewProps> = ({ onNavigateTab: _onNavigateTab }) => {
  const { customer, business } = useCustomerAuth();
  const [activeSegment, setActiveSegment] = useState<'available' | 'vouchers'>('available');

  // Rewards catalog state
  const [rewards, setRewards] = useState<CustomerRewardEvaluation[]>([]);
  const [customerStamps, setCustomerStamps] = useState(0);
  const [customerPoints, setCustomerPoints] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Vouchers state
  const [vouchers, setVouchers] = useState<CustomerClaimedRedemption[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);

  // Claim modal state
  const [selectedReward, setSelectedReward] = useState<CustomerRewardEvaluation | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Active Voucher Pass Modal / Screen
  const [activeVoucherPass, setActiveVoucherPass] = useState<CustomerClaimedRedemption | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const primaryColor = business?.primaryColor || '#4F6BFF';

  // Fetch available rewards & eligibility
  const fetchRewards = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/customer/rewards');
      if (res.ok) {
        const data = await res.json();
        setRewards(data.rewards || []);
        setCustomerStamps(data.customerStamps ?? customer?.stampsBalance ?? 0);
        setCustomerPoints(data.customerPoints ?? customer?.pointsBalance ?? 0);
      } else {
        throw new Error('Failed to load rewards');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to connect to rewards service');
    } finally {
      setIsLoading(false);
    }
  }, [customer?.stampsBalance, customer?.pointsBalance]);

  // Fetch claimed vouchers
  const fetchVouchers = useCallback(async () => {
    try {
      setLoadingVouchers(true);
      const res = await fetch('/api/customer/redemptions');
      if (res.ok) {
        const data = await res.json();
        setVouchers(data || []);
      }
    } catch (err) {
      console.error('Failed to load vouchers', err);
    } finally {
      setLoadingVouchers(false);
    }
  }, []);

  useEffect(() => {
    fetchRewards();
    fetchVouchers();
  }, [fetchRewards, fetchVouchers]);

  // Execute Claim
  const handleConfirmClaim = async () => {
    if (!selectedReward) return;

    try {
      setIsClaiming(true);
      setClaimError(null);

      // Generate random client idempotency key
      const idempotencyKey = `claim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const res = await fetch(`/api/customer/rewards/${selectedReward.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Unable to claim reward');
      }

      const data = await res.json();
      const redemption: CustomerClaimedRedemption = data.redemption;

      // Close claim modal & show voucher pass
      setSelectedReward(null);
      setActiveVoucherPass(redemption);

      // Refresh data
      fetchRewards();
      fetchVouchers();
    } catch (err: any) {
      setClaimError(err.message);
    } finally {
      setIsClaiming(false);
    }
  };

  // Copy code to clipboard
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const activeVouchers = vouchers.filter((v) => v.status === 'CLAIMED' && !v.isExpired);
  const pastVouchers = vouchers.filter((v) => v.status !== 'CLAIMED' || v.isExpired);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
            Rewards & Vouchers
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
            Redeem your stamps and points for exclusive rewards.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            fetchRewards();
            fetchVouchers();
          }}
          title="Refresh"
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

      {/* Balance Summary Card */}
      <div
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, #3730A3 100%)`,
          borderRadius: '16px',
          padding: '20px',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          boxShadow: '0 10px 20px -5px rgba(79, 107, 255, 0.25)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Stamps
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '2px' }}>
            {customerStamps}
          </div>
        </div>

        <div style={{ width: '1px', height: '36px', backgroundColor: 'rgba(255, 255, 255, 0.2)' }} />

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Points
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '2px' }}>
            {customerPoints}
          </div>
        </div>
      </div>

      {/* Segmented Control */}
      <div
        style={{
          display: 'flex',
          backgroundColor: '#F1F5F9',
          padding: '4px',
          borderRadius: '12px',
          gap: '4px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveSegment('available')}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeSegment === 'available' ? '#FFFFFF' : 'transparent',
            color: activeSegment === 'available' ? '#0F172A' : '#64748B',
            fontWeight: activeSegment === 'available' ? 700 : 500,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: activeSegment === 'available' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          Available Rewards ({rewards.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveSegment('vouchers')}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeSegment === 'vouchers' ? '#FFFFFF' : 'transparent',
            color: activeSegment === 'vouchers' ? '#0F172A' : '#64748B',
            fontWeight: activeSegment === 'vouchers' ? 700 : 500,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: activeSegment === 'vouchers' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          My Vouchers {activeVouchers.length > 0 && `(${activeVouchers.length})`}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* SEGMENT 1: AVAILABLE REWARDS */}
      {activeSegment === 'available' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ height: '100px', backgroundColor: '#E2E8F0', borderRadius: '14px' }} />
              <div style={{ height: '100px', backgroundColor: '#E2E8F0', borderRadius: '14px' }} />
            </div>
          ) : rewards.length === 0 ? (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '36px 20px',
                textAlign: 'center',
              }}
            >
              <Gift size={40} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                No Rewards Available Right Now
              </div>
              <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                Check back soon or earn more stamps towards upcoming special rewards.
              </p>
            </div>
          ) : (
            rewards.map((reward) => (
              <div
                key={reward.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: reward.isEligible ? `1.5px solid ${primaryColor}40` : '1px solid #E2E8F0',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: reward.isEligible ? '0 4px 12px rgba(79, 107, 255, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>
                      {reward.title}
                    </h3>
                    {reward.description && (
                      <p style={{ fontSize: '12px', color: '#64748B', margin: 0, lineHeight: 1.4 }}>
                        {reward.description}
                      </p>
                    )}
                  </div>

                  {/* Cost Badge */}
                  <div
                    style={{
                      padding: '4px 8px',
                      borderRadius: '8px',
                      backgroundColor: reward.stampsRequired ? `${primaryColor}15` : '#FEF3C7',
                      color: reward.stampsRequired ? primaryColor : '#B45309',
                      fontWeight: 700,
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {reward.stampsRequired ? <Award size={13} /> : <Coins size={13} />}
                    {reward.stampsRequired ? `${reward.stampsRequired} Stamps` : `${reward.pointsRequired} Pts`}
                  </div>
                </div>

                {/* Progress bar towards reward */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
                    <span>Progress</span>
                    <span>
                      {reward.stampsRequired
                        ? `${customerStamps} / ${reward.stampsRequired} stamps`
                        : `${customerPoints} / ${reward.pointsRequired} points`}
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: '#F1F5F9',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${reward.progressPct}%`,
                        height: '100%',
                        backgroundColor: reward.isEligible ? '#22C55E' : primaryColor,
                        borderRadius: '3px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Action button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                  {reward.branchName ? (
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      Valid at: {reward.branchName}
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      Valid at all locations
                    </span>
                  )}

                  {reward.isEligible ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReward(reward);
                        setClaimError(null);
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '10px',
                        backgroundColor: primaryColor,
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 6px rgba(79, 107, 255, 0.25)',
                      }}
                    >
                      <Sparkles size={14} />
                      Claim Reward
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        backgroundColor: '#F1F5F9',
                        color: '#94A3B8',
                        border: 'none',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'not-allowed',
                      }}
                    >
                      {reward.stampsNeeded > 0
                        ? `Need ${reward.stampsNeeded} more stamps`
                        : reward.pointsNeeded > 0
                        ? `Need ${reward.pointsNeeded} more pts`
                        : reward.ineligibilityReasons.includes('CUSTOMER_LIMIT_REACHED')
                        ? 'Claim Limit Reached'
                        : 'Not Available'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* SEGMENT 2: MY VOUCHERS */}
      {activeSegment === 'vouchers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Active Vouchers Section */}
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
              ACTIVE VOUCHERS (READY TO USE)
            </div>

            {loadingVouchers ? (
              <div style={{ height: '80px', backgroundColor: '#E2E8F0', borderRadius: '12px' }} />
            ) : activeVouchers.length === 0 ? (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid #E2E8F0',
                  padding: '24px 16px',
                  textAlign: 'center',
                }}
              >
                <QrCode size={32} color="#94A3B8" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                  No Active Vouchers
                </div>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0' }}>
                  Claim a reward from the catalog to generate a single-use redemption code.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {activeVouchers.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => setActiveVoucherPass(v)}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '14px',
                      border: `1.5px solid ${primaryColor}40`,
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(79, 107, 255, 0.06)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                        {v.reward?.title || 'Reward'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: primaryColor,
                            fontSize: '13px',
                          }}
                        >
                          {v.redemptionCode}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                          • Expires {v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : '30 days'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        backgroundColor: `${primaryColor}15`,
                        color: primaryColor,
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Show Code
                      <ChevronRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past / Redeemed Vouchers Section */}
          {pastVouchers.length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748B', marginBottom: '8px', marginTop: '8px' }}>
                PAST & REDEEMED
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pastVouchers.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      backgroundColor: '#F8FAFC',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: 0.85,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                        {v.reward?.title || 'Reward'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                        {v.status === 'REDEEMED' ? (
                          <span>Redeemed {v.redeemedAt ? new Date(v.redeemedAt).toLocaleDateString() : ''}</span>
                        ) : v.isExpired ? (
                          <span style={{ color: '#EF4444' }}>Expired</span>
                        ) : (
                          <span>Status: {v.status}</span>
                        )}
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: v.status === 'REDEEMED' ? '#DCFCE7' : '#F1F5F9',
                        color: v.status === 'REDEEMED' ? '#166534' : '#64748B',
                      }}
                    >
                      {v.status === 'REDEEMED' ? 'REDEEMED' : v.isExpired ? 'EXPIRED' : v.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CLAIM CONFIRMATION MODAL */}
      {selectedReward && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '380px',
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '16px',
                  backgroundColor: `${primaryColor}15`,
                  color: primaryColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                }}
              >
                <Gift size={28} />
              </div>

              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Claim Reward?
              </h3>
              <div style={{ fontSize: '14px', fontWeight: 600, color: primaryColor, marginTop: '4px' }}>
                {selectedReward.title}
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                padding: '14px',
                fontSize: '13px',
                color: '#475569',
                lineHeight: 1.5,
              }}
            >
              {selectedReward.stampsRequired ? (
                <div>
                  This will deduct <strong>{selectedReward.stampsRequired} stamps</strong> from your balance. Your remaining balance will be{' '}
                  <strong>{customerStamps - selectedReward.stampsRequired} stamps</strong>.
                </div>
              ) : (
                <div>
                  This will deduct <strong>{selectedReward.pointsRequired} points</strong> from your balance. Your remaining balance will be{' '}
                  <strong>{customerPoints - (selectedReward.pointsRequired || 0)} points</strong>.
                </div>
              )}
            </div>

            {claimError && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '10px',
                  color: '#991B1B',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                {claimError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setSelectedReward(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClaiming}
                onClick={handleConfirmClaim}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: primaryColor,
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(79, 107, 255, 0.3)',
                }}
              >
                {isClaiming ? 'Claiming...' : 'Yes, Claim Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ACTIVE VOUCHER PASS SCREEN */}
      {activeVoucherPass && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '380px',
              backgroundColor: '#FFFFFF',
              borderRadius: '24px',
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative',
            }}
          >
            {/* Header Badge */}
            <div
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                backgroundColor: '#DCFCE7',
                color: '#166534',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '16px',
              }}
            >
              <ShieldCheck size={14} />
              AUTHENTIC REWARD VOUCHER
            </div>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {activeVoucherPass.reward?.title}
              </h3>
              {activeVoucherPass.reward?.description && (
                <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0', lineHeight: 1.4 }}>
                  {activeVoucherPass.reward.description}
                </p>
              )}
            </div>

            {/* Prominent Redemption Code Box */}
            <div
              style={{
                width: '100%',
                backgroundColor: '#F8FAFC',
                border: '2px dashed #CBD5E1',
                borderRadius: '16px',
                padding: '18px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '18px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', letterSpacing: '0.05em' }}>
                SHOW THIS CODE TO THE CASHIER
              </span>

              <div
                style={{
                  fontSize: '26px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  letterSpacing: '0.08em',
                  color: primaryColor,
                }}
              >
                {activeVoucherPass.redemptionCode}
              </div>

              {/* Barcode visual lines */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  height: '24px',
                  marginTop: '4px',
                  opacity: 0.7,
                }}
              >
                {[4, 2, 6, 2, 8, 3, 5, 2, 7, 3, 2, 6, 4, 8, 2, 5, 3, 7, 2, 4].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      width: h > 4 ? '3px' : '2px',
                      height: '100%',
                      backgroundColor: '#0F172A',
                      borderRadius: '1px',
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleCopyCode(activeVoucherPass.redemptionCode)}
                style={{
                  marginTop: '6px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                {copiedCode ? <Check size={12} color="#22C55E" /> : <Copy size={12} />}
                {copiedCode ? 'Copied to Clipboard!' : 'Copy Code'}
              </button>
            </div>

            {/* Validity notice */}
            <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center', marginBottom: '20px' }}>
              Valid until{' '}
              <strong>
                {activeVoucherPass.expiresAt
                  ? new Date(activeVoucherPass.expiresAt).toLocaleDateString()
                  : '30 days from claim'}
              </strong>
              {activeVoucherPass.branch && <div>Only valid at: {activeVoucherPass.branch.name}</div>}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setActiveVoucherPass(null)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Done / Return to Portal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
