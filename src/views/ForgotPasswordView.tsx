import React, { useState } from 'react';
import { Award, Mail, ArrowLeft, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface ForgotPasswordViewProps {
  onBackToLogin: () => void;
}

export const ForgotPasswordView: React.FC<ForgotPasswordViewProps> = ({ onBackToLogin }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to request password reset');
      } else {
        setMessage(data.message || 'Password reset instructions dispatched.');
        if (data.devToken) {
          setDevToken(data.devToken);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devToken || !newPassword) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: devToken, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
      } else {
        setResetSuccess(true);
        setMessage('Password has been successfully updated! You can now log in.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setIsLoading(false);
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
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: 'var(--radius-xl)',
            backgroundColor: 'var(--color-primary)',
            color: '#FFFFFF',
            boxShadow: 'var(--shadow-primary-glow)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <Award size={28} strokeWidth={2.5} />
        </div>
        <h1
          style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.025em',
            margin: '0 0 var(--space-1) 0',
          }}
        >
          Reployty
        </h1>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 440,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-card-elevated)',
          padding: 'var(--space-8)',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={onBackToLogin}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--color-text-muted)',
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            marginBottom: 'var(--space-4)',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to sign in</span>
        </button>

        <h2
          style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            margin: '0 0 var(--space-2) 0',
          }}
        >
          Reset your password
        </h2>
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-muted)',
            margin: '0 0 var(--space-6) 0',
          }}
        >
          Enter your registered email and we'll verify your identity.
        </p>

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
              marginBottom: 'var(--space-4)',
              color: 'var(--color-danger-text)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{error}</div>
          </div>
        )}

        {message && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--color-success-subtle, #ecfdf5)',
              border: '1px solid var(--color-success-border, #a7f3d0)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
              color: 'var(--color-success-text, #065f46)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{message}</div>
          </div>
        )}

        {!devToken ? (
          <form onSubmit={handleRequestReset}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <Input
                type="email"
                label="Registered Work Email"
                placeholder="marcus@reployty.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                leftIcon={<Mail size={16} />}
                required
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isLoading}
                style={{ width: '100%' }}
              >
                Send Reset Link
              </Button>
            </div>
          </form>
        ) : !resetSuccess ? (
          <form onSubmit={handleCompleteReset} style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--color-surface-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  wordBreak: 'break-all',
                }}
              >
                <strong>Dev Reset Token:</strong> {devToken}
              </div>
              <Input
                type="password"
                label="Enter New Password (min 8 chars)"
                placeholder="NewSecurePass123!"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                leftIcon={<KeyRound size={16} />}
                required
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isLoading}
                style={{ width: '100%' }}
              >
                Update Password
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={onBackToLogin}
            style={{ width: '100%', marginTop: 'var(--space-4)' }}
          >
            Go to Sign In
          </Button>
        )}
      </div>
    </div>
  );
};
