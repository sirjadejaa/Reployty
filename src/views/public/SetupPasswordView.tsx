import React, { useState, useEffect } from 'react';
import {
  Award,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Mail,
  ArrowRight,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';

export interface SetupPasswordViewProps {
  onComplete?: () => void;
}

export const SetupPasswordView: React.FC<SetupPasswordViewProps> = ({ onComplete }) => {
  const { refreshAuth } = useAuth();
  const [token, setToken] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(true);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [invitationInfo, setInvitationInfo] = useState<{
    businessName: string;
    ownerEmail: string;
    ownerName: string;
    category?: string;
  } | null>(null);

  // Form State
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Extract token from URL hash (e.g. #setup-password?token=abcdef123...)
  useEffect(() => {
    const rawHash = window.location.hash.replace('#', '');
    const [, queryPart] = rawHash.split('?');
    let extractedToken = '';

    if (queryPart) {
      const searchParams = new URLSearchParams(queryPart);
      extractedToken = searchParams.get('token') || '';
    }

    if (!extractedToken) {
      // Also check standard location.search as fallback
      const searchParams = new URLSearchParams(window.location.search);
      extractedToken = searchParams.get('token') || '';
    }

    setToken(extractedToken);

    if (!extractedToken) {
      setIsVerifying(false);
      setVerificationError('No invitation token found in link. Please use the complete setup link provided.');
      return;
    }

    // Verify token with server
    const verifyToken = async () => {
      try {
        setIsVerifying(true);
        setVerificationError(null);

        const res = await fetch(`/api/public/invitations/verify?token=${encodeURIComponent(extractedToken)}`, {
          headers: { Accept: 'application/json' },
        });

        const json = await res.json();
        if (!res.ok || !json.valid) {
          throw new Error(json.error || 'Invitation token is invalid, expired, or has already been used.');
        }

        setInvitationInfo({
          businessName: json.businessName,
          ownerEmail: json.ownerEmail,
          ownerName: json.ownerName,
          category: json.category,
        });
      } catch (err: any) {
        setVerificationError(err.message || 'Failed to verify invitation link.');
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!password || password.length < 8) {
      setSubmitError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match. Please verify.');
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await fetch('/api/public/invitations/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to set password');
      }

      setIsSuccess(true);

      // Refresh session in context so app knows user is authenticated
      if (refreshAuth) {
        await refreshAuth();
      }


      // Auto redirect to onboarding or dashboard after 1.5s
      setTimeout(() => {
        if (onComplete) {
          onComplete();
        } else {
          window.location.hash = 'onboarding';
        }
      }, 1500);
    } catch (err: any) {
      setSubmitError(err.message || 'Could not complete password setup.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          Welcome to Reployty
        </h1>
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            margin: 0,
          }}
        >
          Your business workspace is ready.
        </p>
      </div>

      {/* Main Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-card-elevated)',
          padding: 'var(--space-8)',
          boxSizing: 'border-box',
        }}
      >
        {isVerifying ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              Verifying secure setup invitation...
            </div>
          </div>
        ) : verificationError ? (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                padding: 'var(--space-4)',
                backgroundColor: 'var(--color-danger-subtle)',
                border: '1px solid var(--color-danger-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-danger-text)',
                fontSize: 'var(--font-size-sm)',
                lineHeight: 1.4,
                marginBottom: 'var(--space-6)',
              }}
              role="alert"
            >
              <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Invalid or Expired Link</strong>
                <p style={{ margin: '4px 0 0 0' }}>{verificationError}</p>
              </div>
            </div>

            <Button
              variant="outline"
              size="md"
              onClick={() => {
                window.location.hash = '';
              }}
              style={{ width: '100%' }}
            >
              Go to Login
            </Button>
          </div>
        ) : isSuccess ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                backgroundColor: '#ECFDF5',
                color: '#059669',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 'var(--space-4)',
              }}
            >
              <CheckCircle2 size={28} />
            </div>

            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: '0 0 var(--space-2) 0' }}>
              Password Configured
            </h2>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-6) 0' }}>
              Your workspace is active. Launching business onboarding...
            </p>

            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                if (onComplete) onComplete();
                else window.location.hash = 'onboarding';
              }}
              style={{ width: '100%' }}
              rightIcon={<ArrowRight size={16} />}
            >
              Go to Business Dashboard
            </Button>
          </div>
        ) : (
          <div>
            {/* Workspace Context Box */}
            <div
              style={{
                backgroundColor: 'var(--color-bg)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Building2 size={16} color="var(--color-primary)" />
                <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                  {invitationInfo?.businessName}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                <Mail size={14} />
                <span>{invitationInfo?.ownerEmail}</span>
              </div>
            </div>

            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, margin: '0 0 var(--space-1) 0' }}>
              Create your password
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '0 0 var(--space-5) 0' }}>
              Choose a strong password to secure your admin account.
            </p>

            {submitError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-danger-subtle)',
                  border: '1px solid var(--color-danger-border)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-4)',
                  color: 'var(--color-danger-text)',
                  fontSize: 'var(--font-size-xs)',
                }}
                role="alert"
              >
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Input
                  id="setup-pass"
                  type={showPassword ? 'text' : 'password'}
                  label="New Password (min 8 characters) *"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  leftIcon={<Lock size={16} />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: 'var(--color-text-muted)',
                      }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                  required
                  autoComplete="new-password"
                />

                <Input
                  id="setup-confirm-pass"
                  type={showPassword ? 'text' : 'password'}
                  label="Confirm Password *"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  leftIcon={<Lock size={16} />}
                  required
                  autoComplete="new-password"
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={isSubmitting}
                  style={{ width: '100%', marginTop: 'var(--space-2)' }}
                  rightIcon={<ArrowRight size={16} />}
                >
                  Set Password & Continue
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
