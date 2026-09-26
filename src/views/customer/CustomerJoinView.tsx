import React, { useState, useEffect } from 'react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { PublicQrResolution } from '../../types/customer';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AlertCircle, ArrowLeft, CheckCircle, Clock, ShieldCheck, Sparkles } from 'lucide-react';

interface CustomerJoinViewProps {
  qrCodeToken: string;
  onJoinSuccess: () => void;
}

export const CustomerJoinView: React.FC<CustomerJoinViewProps> = ({ qrCodeToken, onJoinSuccess }) => {
  const { resolveQr, requestOtp, verifyOtp } = useCustomerAuth();

  const [qrData, setQrData] = useState<PublicQrResolution | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [step, setStep] = useState<'phone' | 'otp' | 'name'>('phone');
  const [countryCode, setCountryCode] = useState<string>('+1');
  const [phoneDigits, setPhoneDigits] = useState<string>('');
  const [termsAccepted, setTermsAccepted] = useState<boolean>(true);
  const [marketingConsent, setMarketingConsent] = useState<boolean>(false);

  // OTP states
  const [otpCode, setOtpCode] = useState<string>('');
  const [challengeId, setChallengeId] = useState<string | undefined>();
  const [devOtpHint, setDevOtpHint] = useState<string | undefined>();
  const [countdown, setCountdown] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Name prompt state
  const [customerName, setCustomerName] = useState<string>('');

  // 1. Resolve QR on Mount
  useEffect(() => {
    let mounted = true;
    const fetchQr = async () => {
      setLoading(true);
      setError(null);
      try {
        const resolved = await resolveQr(qrCodeToken);
        if (mounted) {
          setQrData(resolved);
          // Pre-select country code based on business country if available
          if (resolved.business.phone?.startsWith('+91')) {
            setCountryCode('+91');
          }
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Unable to load business details from QR code.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchQr();
    return () => {
      mounted = false;
    };
  }, [qrCodeToken]);

  // Countdown timer for OTP resend cooldown
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const fullPhone = `${countryCode}${phoneDigits.replace(/\D/g, '')}`;

  // Handle OTP Request
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrData?.business.id) return;
    if (phoneDigits.replace(/\D/g, '').length < 7) {
      setError('Please enter a valid mobile phone number.');
      return;
    }
    if (!termsAccepted) {
      setError('Please accept the Terms of Service & Privacy Policy to continue.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await requestOtp(qrData.business.id, fullPhone);
      setChallengeId(res.challengeId);
      if (res.devOtp) {
        setDevOtpHint(res.devOtp);
      }
      setCountdown(60); // 60s cooldown
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle OTP Verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrData?.business.id) return;
    if (otpCode.trim().length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyOtp({
        businessId: qrData.business.id,
        phone: fullPhone,
        code: otpCode.trim(),
        challengeId,
        marketingConsent,
        branchId: qrData.branch?.id,
      });

      // If new customer with placeholder name, prompt for real name
      if (result.isNew || result.customer.name === 'New Regular') {
        setStep('name');
      } else {
        onJoinSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Name Save
  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      onJoinSuccess();
      return;
    }

    setSubmitting(true);
    try {
      await fetch('/api/customer/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customerName.trim() }),
      });
      onJoinSuccess();
    } catch {
      onJoinSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  const primaryColor = qrData?.business.primaryColor || '#4F6BFF';

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            backgroundColor: `${primaryColor}20`,
            color: primaryColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            animation: 'pulse 1.5s infinite',
          }}
        >
          <Sparkles size={24} />
        </div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A' }}>
          Connecting to business...
        </div>
        <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
          Loading your customer loyalty experience
        </div>
      </div>
    );
  }

  if (error && !qrData) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            backgroundColor: '#FEE2E2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <AlertCircle size={26} />
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
          Invalid or Expired QR Code
        </div>
        <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '320px', lineHeight: 1.5, marginBottom: '24px' }}>
          {error}
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  const business = qrData!.business;
  const branch = qrData!.branch;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F1F5F9',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.06)',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* Business Hero Banner */}
        <div
          style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, #1E293B 100%)`,
            color: '#FFFFFF',
            padding: '32px 24px 28px',
            textAlign: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '16px',
              backgroundColor: '#FFFFFF',
              color: primaryColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 800,
              margin: '0 auto 14px',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)',
            }}
          >
            {business.name.charAt(0)}
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
            {business.name}
          </h1>
          {branch?.name && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                padding: '4px 10px',
                borderRadius: '12px',
                marginTop: '8px',
                backdropFilter: 'blur(4px)',
              }}
            >
              <span>{branch.name}</span>
              {branch.code && <span style={{ opacity: 0.8 }}>({branch.code})</span>}
            </div>
          )}
          {business.description && (
            <p
              style={{
                fontSize: '13px',
                color: 'rgba(255, 255, 255, 0.85)',
                marginTop: '10px',
                marginBottom: 0,
                lineHeight: 1.4,
              }}
            >
              {business.description}
            </p>
          )}
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px' }}>
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '10px',
                color: '#B91C1C',
                fontSize: '13px',
                marginBottom: '18px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div>{error}</div>
            </div>
          )}

          {/* STEP 1: Phone Number Input */}
          {step === 'phone' && (
            <form onSubmit={handleRequestOtp}>
              <div style={{ marginBottom: '16px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                  Join or Sign In
                </h2>
                <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
                  Enter your mobile number. We'll text you a verification code to securely access your customer profile.
                </p>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                  Mobile Phone Number *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={countryCode}
                    onChange={e => setCountryCode(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#F8FAFC',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#334155',
                      cursor: 'pointer',
                      width: '90px',
                    }}
                  >
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+91">🇮🇳 +91</option>
                    <option value="+44">🇬🇧 +44</option>
                    <option value="+61">🇦🇺 +61</option>
                    <option value="+971">🇦🇪 +971</option>
                  </select>
                  <input
                    type="tel"
                    required
                    placeholder="(555) 000-0000"
                    value={phoneDigits}
                    onChange={e => setPhoneDigits(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      fontSize: '15px',
                      color: '#0F172A',
                      outline: 'none',
                    }}
                    autoFocus
                  />
                </div>
              </div>

              {/* Consent Checkboxes */}
              <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={e => setTermsAccepted(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <span style={{ fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                    I accept the <strong>Terms of Service</strong> and acknowledge the <strong>Privacy Policy</strong>.
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={e => setMarketingConsent(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <span style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
                    (Optional) Send me exclusive member offers, birthday rewards, and updates from {business.name}.
                  </span>
                </label>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                style={{
                  width: '100%',
                  height: '46px',
                  fontSize: '15px',
                  fontWeight: 600,
                  backgroundColor: primaryColor,
                  borderColor: primaryColor,
                }}
              >
                {submitting ? 'Sending Code...' : 'Continue with Phone'}
              </Button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginTop: '16px',
                  fontSize: '12px',
                  color: '#94A3B8',
                }}
              >
                <ShieldCheck size={15} color="#16A34A" />
                <span>Protected by Reployty Secure Verification</span>
              </div>
            </form>
          )}

          {/* STEP 2: OTP Entry */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp}>
              <div style={{ marginBottom: '18px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setError(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748B',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                    cursor: 'pointer',
                    marginBottom: '10px',
                  }}
                >
                  <ArrowLeft size={16} /> Edit phone number
                </button>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                  Enter Verification Code
                </h2>
                <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
                  We sent a 6-digit code to <strong style={{ color: '#0F172A' }}>{fullPhone}</strong>
                </p>
              </div>

              {/* Dev Simulation Mode Hint */}
              {devOtpHint && (
                <div
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#EEF2FF',
                    border: '1px solid #C7D2FE',
                    borderRadius: '10px',
                    color: '#4338CA',
                    fontSize: '13px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Simulation Code: <strong>{devOtpHint}</strong></span>
                  <button
                    type="button"
                    onClick={() => setOtpCode(devOtpHint)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#4F6BFF',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '12px',
                      textDecoration: 'underline',
                    }}
                  >
                    Auto-Fill
                  </button>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="• • • • • •"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '2px solid #CBD5E1',
                    fontSize: '24px',
                    letterSpacing: '0.4em',
                    textAlign: 'center',
                    fontWeight: 700,
                    color: '#0F172A',
                    outline: 'none',
                    backgroundColor: '#F8FAFC',
                  }}
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={submitting || otpCode.length !== 6}
                style={{
                  width: '100%',
                  height: '46px',
                  fontSize: '15px',
                  fontWeight: 600,
                  backgroundColor: primaryColor,
                  borderColor: primaryColor,
                }}
              >
                {submitting ? 'Verifying...' : 'Verify & Enter'}
              </Button>

              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                {countdown > 0 ? (
                  <div style={{ fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    <Clock size={14} /> Resend code in {countdown}s
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: primaryColor,
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Resend verification code
                  </button>
                )}
              </div>
            </form>
          )}

          {/* STEP 3: Customer Name Prompt */}
          {step === 'name' && (
            <form onSubmit={handleSaveName}>
              <div style={{ marginBottom: '18px', textAlign: 'center' }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    backgroundColor: '#DCFCE7',
                    color: '#16A34A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <CheckCircle size={26} />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
                  Phone Verified!
                </h2>
                <p style={{ fontSize: '13px', color: '#64748B' }}>
                  What should we call you at {business.name}?
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <Input
                  label="Your Name / Preferred Nickname"
                  placeholder="e.g. Alex"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                style={{
                  width: '100%',
                  height: '46px',
                  fontSize: '15px',
                  fontWeight: 600,
                  backgroundColor: primaryColor,
                  borderColor: primaryColor,
                }}
              >
                {submitting ? 'Saving...' : 'Enter Customer Portal'}
              </Button>

              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={onJoinSuccess}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Skip for now
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
