import React from 'react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { Award, Clock, Sparkles, UserCheck, UtensilsCrossed, Tag, Star } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { CustomerPwaTab } from '../../components/customer/CustomerPwaShell';
import { MemberIdentificationPass } from '../../components/customer/MemberIdentificationPass';

interface CustomerHomeViewProps {
  onNavigateTab: (tab: CustomerPwaTab) => void;
}

export const CustomerHomeView: React.FC<CustomerHomeViewProps> = ({ onNavigateTab }) => {
  const { customer, business, loyaltyState } = useCustomerAuth();

  const primaryColor = business?.primaryColor || '#4F6BFF';
  const program = loyaltyState?.program;
  const isPointsProgram = program?.type === 'POINTS';
  const targetStamps = loyaltyState?.progress?.targetStamps || loyaltyState?.card?.totalStampsNeeded || program?.targetStamps || 10;
  const currentStamps = loyaltyState?.progress?.currentStamps ?? loyaltyState?.card?.stampsCollected ?? customer?.stampsBalance ?? 0;
  const currentPoints = loyaltyState?.progress?.currentPoints ?? loyaltyState?.card?.pointsBalance ?? customer?.pointsBalance ?? 0;
  const rewardTitle = program?.rewardTitle || 'Exclusive Regular Reward';
  const stampsRemaining = Math.max(0, targetStamps - currentStamps);

  const memberSince = customer?.joinedAt
    ? new Date(customer.joinedAt).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
    : 'Recent';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Welcome Card */}
      <div
        style={{
          padding: '16px 18px',
          borderRadius: '16px',
          background: `linear-gradient(135deg, ${primaryColor} 0%, #1E293B 100%)`,
          color: '#FFFFFF',
          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={15} color="#FBBF24" />
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.9 }}>
              Regular Member
            </span>
          </div>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(4px)',
            }}
          >
            {customer?.status || 'ACTIVE'}
          </div>
        </div>

        <h1 style={{ fontSize: '19px', fontWeight: 800, margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
          Welcome, {customer?.name || 'Valued Regular'}!
        </h1>
        <p style={{ fontSize: '12px', margin: 0, opacity: 0.85, lineHeight: 1.35 }}>
          You're a registered customer at <strong>{business?.name}</strong>.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Visits
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>
              {customer?.totalVisits || 1}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Member Since
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>
              {memberSince}
            </div>
          </div>
        </div>
      </div>

      {/* Loyalty Pass Experience */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={20} color={primaryColor} />
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
              {program?.name || 'Digital Loyalty Pass'}
            </h2>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: '#EEF2FF',
              color: '#3246C6',
            }}
          >
            {isPointsProgram
              ? `${currentPoints.toLocaleString()} Points Active`
              : `${currentStamps}/${targetStamps} Stamps Active`}
          </span>
        </div>

        <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '16px' }}>
          {isPointsProgram
            ? `Earn reward points on qualifying spend to unlock ${rewardTitle}. Present your member pass at checkout.`
            : `Collect stamps on every visit to unlock ${rewardTitle}. ${stampsRemaining === 0 ? '🎉 Card completed!' : `${stampsRemaining} more stamp${stampsRemaining === 1 ? '' : 's'} needed.`}`}
        </p>

        {/* Live visual progress */}
        {isPointsProgram ? (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Accumulated Points
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                {currentPoints.toLocaleString()} <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748B' }}>pts</span>
              </div>
              {loyaltyState?.progress?.pointsConversionLabel && (
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                  {loyaltyState.progress.pointsConversionLabel}
                </div>
              )}
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                backgroundColor: '#EEF2FF',
                color: '#3246C6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
              }}
            >
              🎁
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(5, targetStamps)}, 1fr)`,
              gap: '10px',
              padding: '16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '12px',
              border: '1px dashed #CBD5E1',
              marginBottom: '16px',
            }}
          >
            {Array.from({ length: targetStamps }).map((_, i) => {
              const isFilled = i < currentStamps;
              const isGift = i === targetStamps - 1;
              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: '1',
                    borderRadius: '50%',
                    border: `2px ${isFilled ? 'solid' : 'dashed'} ${isFilled ? primaryColor : '#CBD5E1'}`,
                    backgroundColor: isFilled ? `${primaryColor}` : '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: isFilled ? '#FFFFFF' : '#94A3B8',
                  }}
                >
                  {isGift ? '🎁' : isFilled ? '✓' : i + 1}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {isPointsProgram
              ? 'Earn points on every visit'
              : 'Earn 1 stamp per qualifying visit'}
          </div>
          <Button variant="primary" size="sm" onClick={() => onNavigateTab('loyalty')}>
            View Pass Details
          </Button>
        </div>
      </div>

      {/* Real Member Identification Pass */}
      <MemberIdentificationPass
        customerPhone={customer?.phone}
        customerId={customer?.id}
        customerName={customer?.name || 'Valued Customer'}
        businessName={business?.name}
        businessLogo={business?.logo}
        primaryColor={primaryColor}
        cardStatus={(loyaltyState?.card?.status as any) || 'ACTIVE'}
        showInstructions={true}
      />

      {/* Offers Quick Link */}
      <div
        onClick={() => onNavigateTab('offers')}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '10px',
              backgroundColor: 'rgba(235, 94, 40, 0.1)',
              color: '#EB5E28',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Tag size={22} />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
              Special Offers & Deals
            </div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              Exclusive member discounts and perks
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onNavigateTab('offers')}>
          View Deals
        </Button>
      </div>

      {/* Catalog Quick Link */}
      <div
        onClick={() => onNavigateTab('catalog')}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '10px',
              backgroundColor: `${primaryColor}15`,
              color: primaryColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UtensilsCrossed size={22} />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
              Menu & Offerings
            </div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              Explore available items and prices
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onNavigateTab('catalog')}>
          Browse
        </Button>
      </div>

      {/* Leave a Review Quick Link */}
      <div
        onClick={() => onNavigateTab('review')}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '10px',
              backgroundColor: '#FFFBEB',
              color: '#F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Star size={22} fill="#F59E0B" color="#F59E0B" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
              Leave a Review
            </div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              Share your feedback & support us on Google
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onNavigateTab('review')}>
          Review ⭐
        </Button>
      </div>

      {/* Quick Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <button
          onClick={() => onNavigateTab('activity')}
          style={{
            padding: '16px',
            borderRadius: '14px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <Clock size={20} color={primaryColor} />
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
            Activity Feed
          </div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            View your visits & log
          </div>
        </button>

        <button
          onClick={() => onNavigateTab('profile')}
          style={{
            padding: '16px',
            borderRadius: '14px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <UserCheck size={20} color="#16A34A" />
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
            Preferences
          </div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            Consent & settings
          </div>
        </button>
      </div>
    </div>
  );
};
