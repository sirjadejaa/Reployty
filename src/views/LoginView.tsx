import React, { useState } from 'react';
import { Award, Lock, Mail, AlertTriangle, ShieldCheck, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface LoginViewProps {
  onNavigateForgotPassword?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onNavigateForgotPassword }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await login(email, password);
    setIsLoading(false);
    if (!result.success) {
      setError(result.error || 'Authentication failed. Please check your credentials.');
    }
  };

  const handleQuickFill = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
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
        <p
          style={{
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-text-muted)',
            margin: 0,
            fontWeight: 400,
          }}
        >
          Turn customers into regulars.
        </p>
      </div>

      {/* Main Login Card */}
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
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2
            style={{
              fontSize: 'var(--font-size-xl)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              margin: '0 0 var(--space-1) 0',
            }}
          >
            Welcome back
          </h2>
          <p
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-muted)',
              margin: 0,
            }}
          >
            Sign in to manage your customer retention & loyalty.
          </p>
        </div>

        {/* Error Alert Box */}
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
              marginBottom: 'var(--space-6)',
              color: 'var(--color-danger-text)',
              fontSize: 'var(--font-size-sm)',
              lineHeight: 1.4,
            }}
            role="alert"
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input
              id="login-email"
              type="email"
              label="Work Email"
              placeholder="you@business.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              leftIcon={<Mail size={16} />}
              required
              autoComplete="username"
            />

            <div style={{ position: 'relative' }}>
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                label="Password"
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
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                required
                autoComplete="current-password"
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              <span style={{ color: 'var(--color-text-muted)' }}>
                🔒 Production DB Auth (Bcrypt + HttpOnly)
              </span>
              {onNavigateForgotPassword && (
                <button
                  type="button"
                  onClick={onNavigateForgotPassword}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--color-primary)',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isLoading}
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
              rightIcon={<ArrowRight size={16} />}
            >
              Sign In to Reployty
            </Button>

            <div
              style={{
                marginTop: 'var(--space-4)',
                textAlign: 'center',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-muted)',
              }}
            >
              New business?{' '}
              <a
                href="#get-started"
                style={{
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Apply for Reployty Workspace
              </a>
            </div>
          </div>
        </form>


        {/* Quick Testing Personas */}
        <div
          style={{
            marginTop: 'var(--space-8)',
            paddingTop: 'var(--space-6)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-3)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <ShieldCheck size={14} color="var(--color-primary)" />
            <span>Interactive Demo Personas</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={() => handleQuickFill('marcus@reployty.com', 'OwnerPass123!')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface-subtle)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Marcus Vance — Owner (Multi-Tenant)
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  marcus@reployty.com • The Roasted Bean & Luxe Salon
                </div>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-subtle)',
                  color: 'var(--color-primary)',
                }}
              >
                OWNER
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('sarah.cashier@reployty.com', 'StaffPass123!')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface-subtle)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Sarah Jenkins — Staff Member
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  sarah.cashier@reployty.com • The Roasted Bean only
                </div>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-surface-muted)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                STAFF
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFill('admin@reployty.com', 'AdminPass123!')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface-subtle)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  System Administrator — Platform
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  admin@reployty.com • Global SuperAdmin
                </div>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-subtle)',
                  color: 'var(--color-primary)',
                }}
              >
                SUPERADMIN
              </span>
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <button
                type="button"
                onClick={() => handleQuickFill('suspended@reployty.com', 'TestPass123!')}
                style={{
                  padding: 'var(--space-1) var(--space-2)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--color-danger-border)',
                  backgroundColor: 'var(--color-danger-subtle)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: 'var(--color-danger-text)',
                  fontWeight: 500,
                }}
              >
                Test Suspended
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('disabled@reployty.com', 'TestPass123!')}
                style={{
                  padding: 'var(--space-1) var(--space-2)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--color-border)',
                  backgroundColor: 'var(--color-surface-muted)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                }}
              >
                Test Disabled
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Multi-Tenant Footer Note */}
      <div
        style={{
          marginTop: 'var(--space-6)',
          textAlign: 'center',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-muted)',
          maxWidth: 420,
          lineHeight: 1.5,
        }}
      >
        Protected by Bcrypt password hashing, sliding-window rate limiting, and server-verified multi-tenant session isolation.
      </div>
    </div>
  );
};
