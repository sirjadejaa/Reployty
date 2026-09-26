import React, { useState } from 'react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Switch } from '../../components/ui/Switch';
import { Building2, CheckCircle2, Lock, LogOut, Shield, User } from 'lucide-react';

export const CustomerProfileView: React.FC = () => {
  const { customer, business, branch, consents, updateProfile, updateConsent, logout } = useCustomerAuth();

  const [name, setName] = useState<string>(customer?.name || '');
  const [email, setEmail] = useState<string>(customer?.email || '');
  const [birthday, setBirthday] = useState<string>(
    customer?.birthday ? new Date(customer.birthday).toISOString().split('T')[0] : ''
  );

  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const primaryColor = business?.primaryColor || '#4F6BFF';

  // Check marketing consent state
  const marketingConsent = consents.find(c => c.channel === 'MARKETING')?.granted || customer?.marketingConsent || false;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await updateProfile({
        name: name.trim(),
        email: email.trim() || undefined,
        birthday: birthday || undefined,
      });
      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMarketing = async (checked: boolean) => {
    try {
      await updateConsent('MARKETING', checked);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update consent preferences.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
          Customer Profile & Settings
        </h1>
        <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
          Manage your personal details and communication preferences.
        </p>
      </div>

      {successMsg && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 14px',
            backgroundColor: '#DCFCE7',
            border: '1px solid #86EFAC',
            borderRadius: '10px',
            color: '#15803D',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '10px',
            color: '#B91C1C',
            fontSize: '13px',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Personal Info Form */}
      <form
        onSubmit={handleSaveProfile}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <User size={18} color={primaryColor} />
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
            Personal Information
          </h2>
        </div>

        <Input
          label="Your Name *"
          required
          placeholder="e.g. Alex"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        {/* Read-only Verified Phone */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Mobile Phone Number
          </label>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#64748B',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{customer?.phone}</span>
            <span style={{ fontSize: '11px', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Lock size={12} /> Verified
            </span>
          </div>
        </div>

        <Input
          label="Email Address (Optional)"
          type="email"
          placeholder="alex@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <Input
          label="Birthday (Optional — for birthday treats)"
          type="date"
          value={birthday}
          onChange={e => setBirthday(e.target.value)}
        />

        <Button
          type="submit"
          variant="primary"
          disabled={saving}
          style={{
            marginTop: '8px',
            backgroundColor: primaryColor,
            borderColor: primaryColor,
          }}
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </form>

      {/* Consent & Communication Preferences */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={18} color="#16A34A" />
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
            Consent & Privacy
          </h2>
        </div>

        <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
              Terms of Service & Privacy
            </div>
            <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>Active</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', lineHeight: 1.4 }}>
            Required for membership identification and session authentication.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
              Marketing & Member Offers
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', lineHeight: 1.4 }}>
              Receive exclusive member rewards, promotional events, and alerts.
            </div>
          </div>
          <Switch
            checked={marketingConsent}
            onChange={e => handleToggleMarketing(e.target.checked)}
          />
        </div>
      </div>

      {/* Business Details Context */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Building2 size={18} color="#64748B" />
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
            About This Business
          </h2>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
          {business?.name}
        </div>
        {branch?.name && (
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            {branch.name} {branch.address ? `• ${branch.address}` : ''}
          </div>
        )}
        {business?.phone && (
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            Contact: {business.phone}
          </div>
        )}
      </div>

      {/* Customer Logout */}
      <div style={{ padding: '8px 0 20px' }}>
        <Button
          variant="outline"
          onClick={logout}
          style={{
            width: '100%',
            height: '44px',
            color: '#DC2626',
            borderColor: '#FCA5A5',
            backgroundColor: '#FEF2F2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <LogOut size={16} />
          Sign Out of Customer Portal
        </Button>
      </div>
    </div>
  );
};
