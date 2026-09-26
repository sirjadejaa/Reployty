import React, { useEffect, useState } from 'react';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { CustomerActivityItem } from '../../types/customer';
import { Award, Clock, LogIn, RefreshCw, ShieldCheck, Sparkles, User } from 'lucide-react';

export const CustomerActivityView: React.FC = () => {
  const { business } = useCustomerAuth();
  const [activity, setActivity] = useState<CustomerActivityItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadActivity = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/customer/activity');
      if (res.ok) {
        const data = await res.json();
        setActivity(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
  }, []);

  const formatEvent = (item: CustomerActivityItem) => {
    switch (item.type) {
      case 'CUSTOMER_JOINED':
        return {
          icon: <Sparkles size={16} color="#16A34A" />,
          title: `Joined ${business?.name || 'Business'}`,
          desc: 'Successfully verified phone and joined member program.',
        };
      case 'CUSTOMER_REACTIVATED':
        return {
          icon: <LogIn size={16} color="#2563EB" />,
          title: 'Portal Visit & Login',
          desc: 'Authenticated through customer portal.',
        };
      case 'PURCHASE_RECORDED':
        return {
          icon: <User size={16} color="#8B5CF6" />,
          title: 'Profile Updated',
          desc: 'Personal customer information was updated.',
        };
      case 'STAMP_ADDED':
        return {
          icon: <Award size={16} color="#F59E0B" />,
          title: 'Stamp Earned',
          desc: 'Stamp added to your active rewards pass.',
        };
      default:
        return {
          icon: <ShieldCheck size={16} color="#64748B" />,
          title: 'Account Activity',
          desc: item.type.replace(/_/g, ' ').toLowerCase(),
        };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
            Activity Log
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
            Your visit and membership timeline.
          </p>
        </div>
        <button
          onClick={loadActivity}
          disabled={loading}
          style={{
            background: 'none',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '6px 10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            color: '#64748B',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading && activity.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
          Loading your activity timeline...
        </div>
      ) : activity.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
          }}
        >
          <Clock size={32} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>No activity recorded yet</div>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
            Check back after visiting {business?.name || 'the business'}.
          </div>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {activity.map(item => {
            const parsed = formatEvent(item);
            const dateStr = new Date(item.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid #F1F5F9',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '8px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {parsed.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                      {parsed.title}
                    </div>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>{dateStr}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    {parsed.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
