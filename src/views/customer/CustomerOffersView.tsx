import React, { useState, useEffect, useCallback } from 'react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import {
  Tag,
  Calendar,
  Store,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { CustomerOfferItem } from '../../types/offers';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

interface CustomerOffersViewProps {
  onNavigateTab?: (tab: any) => void;
}

export const CustomerOffersView: React.FC<CustomerOffersViewProps> = () => {
  const { business } = useCustomerAuth();
  const [offers, setOffers] = useState<CustomerOfferItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<CustomerOfferItem | null>(null);

  const primaryColor = business?.primaryColor || '#EB5E28';

  const fetchOffers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/customer/offers');
      if (res.ok) {
        const data = await res.json();
        setOffers(Array.isArray(data) ? data : []);
      } else {
        throw new Error('Failed to load offers');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to connect to offers engine');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Hero Banner */}
      <div
        style={{
          borderRadius: '16px',
          background: `linear-gradient(135deg, ${primaryColor} 0%, #1E293B 100%)`,
          padding: '20px',
          color: '#FFFFFF',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div
            style={{
              padding: '3px 8px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Sparkles size={12} />
            EXCLUSIVE PROMOTIONS
          </div>
        </div>

        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.01em' }}>
          Offers & Deals
        </h1>
        <p style={{ fontSize: '13px', margin: 0, opacity: 0.9, lineHeight: 1.4 }}>
          Discover special savings and perks for your visits at {business?.name || 'our store'}.
        </p>
      </div>

      {/* How to Redeem Instruction Pill */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            color: '#10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={18} />
        </div>
        <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
          <strong>Easy Counter Redemption:</strong> Mention any eligible offer to staff when ordering or paying.
        </div>
      </div>

      {/* Offers List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '36px', color: '#64748B', fontSize: '14px' }}>
          Loading available promotions...
        </div>
      ) : error ? (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            fontSize: '13px',
            textAlign: 'center',
          }}
        >
          {error}
          <div style={{ marginTop: '8px' }}>
            <Button size="sm" variant="ghost" onClick={fetchOffers}>
              Retry
            </Button>
          </div>
        </div>
      ) : offers.length === 0 ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '36px 20px',
            textAlign: 'center',
          }}
        >
          <Tag size={36} color="#94A3B8" style={{ marginBottom: '8px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px 0', color: '#0F172A' }}>
            No Offers Available
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
            There are no active promotions right now. Check back soon for new discounts!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {offers.map((offer) => {
            const isEligible = offer.isEligible;
            return (
              <div
                key={offer.id}
                onClick={() => setSelectedOffer(offer)}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: isEligible ? '1px solid #E2E8F0' : '1px solid #F1F5F9',
                  padding: '16px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  opacity: isEligible ? 1 : 0.65,
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Discount Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      backgroundColor: isEligible ? `${primaryColor}15` : '#F1F5F9',
                      color: isEligible ? primaryColor : '#64748B',
                      fontSize: '13px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {offer.type === 'PERCENTAGE_DISCOUNT'
                      ? `${offer.discountValue}% OFF`
                      : offer.type === 'FIXED_DISCOUNT'
                      ? `₹${(offer.discountValue / 100).toFixed(0)} OFF`
                      : offer.type.replace('_', ' ')}
                  </span>

                  {isEligible ? (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle2 size={12} />
                      Available
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#64748B',
                        backgroundColor: '#F1F5F9',
                        padding: '2px 8px',
                        borderRadius: '12px',
                      }}
                    >
                      {offer.ineligibilityReason || 'Unavailable'}
                    </span>
                  )}
                </div>

                {/* Title & Description */}
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0', color: '#0F172A' }}>
                  {offer.title}
                </h3>
                {offer.description && (
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                    {offer.description}
                  </p>
                )}

                {/* Footer Details */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '11px', color: '#64748B', alignItems: 'center' }}>
                  {offer.endDate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Calendar size={12} />
                      Valid till {new Date(offer.endDate).toLocaleDateString()}
                    </div>
                  )}

                  {offer.minPurchaseMinor && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      Min spend: ₹{(offer.minPurchaseMinor / 100).toFixed(0)}
                    </div>
                  )}

                  {offer.branchName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Store size={12} />
                      {offer.branchName}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    marginTop: '8px',
                    color: primaryColor,
                    fontSize: '12px',
                    fontWeight: 600,
                    gap: '2px',
                  }}
                >
                  View Details <ChevronRight size={14} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Offer Details / Terms Modal */}
      <Modal
        isOpen={Boolean(selectedOffer)}
        onClose={() => setSelectedOffer(null)}
        title={selectedOffer?.title || 'Offer Details'}
      >
        {selectedOffer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: 'rgba(235, 94, 40, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>PROMOTION VALUE</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: primaryColor }}>
                  {selectedOffer.type === 'PERCENTAGE_DISCOUNT'
                    ? `${selectedOffer.discountValue}% DISCOUNT`
                    : selectedOffer.type === 'FIXED_DISCOUNT'
                    ? `₹${(selectedOffer.discountValue / 100).toFixed(0)} FLAT OFF`
                    : selectedOffer.type.replace('_', ' ')}
                </div>
              </div>

              {selectedOffer.isEligible ? (
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    color: '#10B981',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  Eligible
                </span>
              ) : (
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    backgroundColor: '#F1F5F9',
                    color: '#64748B',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {selectedOffer.ineligibilityReason}
                </span>
              )}
            </div>

            {selectedOffer.description && (
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 4px 0' }}>About This Offer</h4>
                <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                  {selectedOffer.description}
                </p>
              </div>
            )}

            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 6px 0' }}>Terms & Eligibility</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#64748B', lineHeight: 1.6 }}>
                {selectedOffer.endDate && (
                  <li>Valid until {new Date(selectedOffer.endDate).toLocaleDateString()}</li>
                )}
                {selectedOffer.minPurchaseMinor && (
                  <li>Minimum purchase requirement: ₹{(selectedOffer.minPurchaseMinor / 100).toFixed(0)}</li>
                )}
                {selectedOffer.maxDiscountMinor && (
                  <li>Maximum discount limit: ₹{(selectedOffer.maxDiscountMinor / 100).toFixed(0)}</li>
                )}
                {selectedOffer.branchName ? (
                  <li>Valid exclusively at branch: {selectedOffer.branchName}</li>
                ) : (
                  <li>Valid across all participating branches</li>
                )}
                {selectedOffer.terms && <li>{selectedOffer.terms}</li>}
              </ul>
            </div>

            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                fontSize: '12px',
                color: '#475569',
              }}
            >
              <strong>How to Redeem:</strong> Show your phone number or this offer to staff during checkout. Staff will validate and apply your discount immediately.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <Button variant="primary" onClick={() => setSelectedOffer(null)}>
                Got It
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
