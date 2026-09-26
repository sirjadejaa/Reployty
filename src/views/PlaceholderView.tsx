import React from 'react';
import {
  Users,
  Award,
  Gift,
  Tag,
  UtensilsCrossed,
  Star,
  Megaphone,
  BarChart3,
  UserCheck,
  Settings,
  Construction,
} from 'lucide-react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { AdminRoute } from '../types/loyalty';
import { useTenant } from '../context/TenantContext';

export interface PlaceholderViewProps {
  route: AdminRoute;
  onNavigateHome: () => void;
}

interface PlaceholderConfig {
  title: string;
  description: string;
  icon: React.ReactNode;
  emptyTitle: string;
  emptyDesc: string;
  actionText: string;
  promptStage: string;
}

const MODULE_CONFIGS: Record<string, PlaceholderConfig> = {
  customers: {
    title: 'Customer Directory & CRM',
    description: 'Track all registered loyalty members, visit frequencies, and identify regulars vs at-risk customers.',
    icon: <Users size={28} />,
    emptyTitle: 'Customer CRM Foundation Ready',
    emptyDesc: 'The architecture for tenant-isolated customer records is established. Detailed CRM, customer profiles, and segment filtering will be implemented in the designated feature sequence.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Customer Module Implementation',
  },
  loyalty: {
    title: 'Loyalty Program Rules',
    description: 'Configure stamp cards, points ratio, minimum spend tiers, and expiration rules.',
    icon: <Award size={28} />,
    emptyTitle: 'Loyalty Engine Architecture Ready',
    emptyDesc: 'Digital pass templates and stamp threshold rules are architected. Deep rule configuration and stamp logic will be enabled in the loyalty sequence.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Loyalty Module Implementation',
  },
  rewards: {
    title: 'Reward Catalog',
    description: 'Manage redeemable gifts, free items, discount vouchers, and VIP perks for your members.',
    icon: <Gift size={28} />,
    emptyTitle: 'Rewards Catalog Ready',
    emptyDesc: 'Tenant reward models and redemption token verification are defined. Full reward creation and redemption flows arrive in the rewards sequence.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Rewards Module Implementation',
  },
  offers: {
    title: 'Limited-Time Offers & Promotions',
    description: 'Create flash discounts, birthday treats, and double-stamp days to drive traffic during slow hours.',
    icon: <Tag size={28} />,
    emptyTitle: 'Offers Engine Architecture Ready',
    emptyDesc: 'Time-sensitive promotion structures are defined. Full campaign broadcast logic will be implemented in subsequent phases.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Marketing Module Implementation',
  },
  menu: {
    title: 'Menu, Services & Catalog',
    description: 'Categorized food menu, salon services, or retail product catalog with point-earning values.',
    icon: <UtensilsCrossed size={28} />,
    emptyTitle: 'Catalog Engine Ready',
    emptyDesc: 'Category-specific item mapping is defined in the theme system. Catalog management will be expanded in the services sequence.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Catalog Module Implementation',
  },
  reviews: {
    title: 'Customer Reviews & Feedback',
    description: 'Capture instant post-visit feedback and redirect satisfied regulars to Google Maps reviews.',
    icon: <Star size={28} />,
    emptyTitle: 'Reputation Engine Ready',
    emptyDesc: 'Review submission structures and rating metrics will be introduced in the review management sequence.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Reputation Module Implementation',
  },
  campaigns: {
    title: 'Re-engagement Campaigns',
    description: 'Bring back inactive customers who haven\'t visited in 14, 30, or 60 days via targeted WhatsApp & SMS.',
    icon: <Megaphone size={28} />,
    emptyTitle: 'Retention Engine Architecture Ready',
    emptyDesc: 'Automated cohort tracking and re-engagement triggers are sequenced for implementation in the retention phase.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Retention Module Implementation',
  },
  analytics: {
    title: 'Business Analytics & Insights',
    description: 'Cohort retention charts, peak visit hours, customer lifetime value, and reward ROI metrics.',
    icon: <BarChart3 size={28} />,
    emptyTitle: 'Analytics Pipeline Ready',
    emptyDesc: 'Core performance metrics are currently displayed on your Dashboard. In-depth cohort analytics will be implemented in the analytics sequence.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Analytics Module Implementation',
  },
  staff: {
    title: 'Staff Management & Permissions',
    description: 'Manage cashier PINs, shift permissions, stamp-awarding authorization, and role access control.',
    icon: <UserCheck size={28} />,
    emptyTitle: 'Multi-Tenant RBAC Architecture Ready',
    emptyDesc: 'Role definitions (Owner, Manager, Staff) and permission matrices are established in the technical foundation. Full team invitation workflows will follow.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Staff Module Implementation',
  },
  settings: {
    title: 'Business Profile & Settings',
    description: 'Update store branding, business hours, address, phone number, and counter QR configurations.',
    icon: <Settings size={28} />,
    emptyTitle: 'Tenant Configuration Ready',
    emptyDesc: 'The Reployty Theme Engine and tenant settings are live. Full business profile editing will be implemented in the settings sequence.',
    actionText: 'Return to Dashboard',
    promptStage: 'Sequenced for Settings Module Implementation',
  },
};

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  route,
  onNavigateHome,
}) => {
  const { currentBusiness } = useTenant();
  const config = MODULE_CONFIGS[route] || {
    title: 'Module In Sequence',
    description: 'This module is scheduled in the controlled implementation sequence.',
    icon: <Construction size={28} />,
    emptyTitle: 'Scheduled Module',
    emptyDesc: 'Follow the controlled prompt sequence to implement this feature.',
    actionText: 'Return to Dashboard',
    promptStage: 'Prompt Sequence',
  };

  return (
    <PageContainer>
      <PageHeader
        title={config.title}
        description={`${config.description} Connected to ${currentBusiness.name}.`}
      />

      <Card>
        <EmptyState
          icon={config.icon}
          title={config.emptyTitle}
          description={config.emptyDesc}
          action={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Button variant="primary" onClick={onNavigateHome}>
                {config.actionText}
              </Button>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {config.promptStage}
              </span>
            </div>
          }
        />
      </Card>
    </PageContainer>
  );
};
