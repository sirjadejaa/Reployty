import { BusinessCategory, BusinessThemeConfig } from './tenant';

export interface CategoryThemePreset {
  id: BusinessCategory;
  name: string;
  description: string;
  theme: BusinessThemeConfig;
}

export const CATEGORY_THEME_PRESETS: Record<BusinessCategory, CategoryThemePreset> = {
  cafe: {
    id: 'cafe',
    name: 'Café & Bakery',
    description: 'Warm, welcoming, subtle coffee-inspired visual treatment',
    theme: {
      primaryColor: '#B45309',
      secondaryColor: '#78350F',
      backgroundStyle: 'warm',
      cardStyle: 'bordered',
      fontStyle: 'modern',
    },
  },
  restaurant: {
    id: 'restaurant',
    name: 'Restaurant & Dining',
    description: 'Elegant, premium, food-focused dining ambiance',
    theme: {
      primaryColor: '#BE123C',
      secondaryColor: '#881337',
      backgroundStyle: 'clean',
      cardStyle: 'elevated',
      fontStyle: 'modern',
    },
  },
  salon: {
    id: 'salon',
    name: 'Salon & Spa',
    description: 'Clean, beauty-focused, premium aesthetic',
    theme: {
      primaryColor: '#DB2777',
      secondaryColor: '#9D174D',
      backgroundStyle: 'clean',
      cardStyle: 'bordered',
      fontStyle: 'classic',
    },
  },
  gym: {
    id: 'gym',
    name: 'Gym & Fitness',
    description: 'Energetic, athletic, structured and professional',
    theme: {
      primaryColor: '#0D9488',
      secondaryColor: '#115E59',
      backgroundStyle: 'clean',
      cardStyle: 'minimal',
      fontStyle: 'geometric',
    },
  },
  gamezone: {
    id: 'gamezone',
    name: 'Gamezone & Fun',
    description: 'Playful, vibrant, controlled entertainment style',
    theme: {
      primaryColor: '#7C3AED',
      secondaryColor: '#5B21B6',
      backgroundStyle: 'subtle-pattern',
      cardStyle: 'elevated',
      fontStyle: 'geometric',
    },
  },
  retail: {
    id: 'retail',
    name: 'Retail & Clothing',
    description: 'Fashion, editorial, refined lifestyle look',
    theme: {
      primaryColor: '#2563EB',
      secondaryColor: '#1E3A8A',
      backgroundStyle: 'clean',
      cardStyle: 'bordered',
      fontStyle: 'modern',
    },
  },
  other: {
    id: 'other',
    name: 'General Business',
    description: 'Universal clean SaaS theme for local businesses',
    theme: {
      primaryColor: '#4F6BFF',
      secondaryColor: '#111827',
      backgroundStyle: 'clean',
      cardStyle: 'bordered',
      fontStyle: 'modern',
    },
  },
};

export function getCategoryThemePreset(presetOrCategory?: string | null): CategoryThemePreset {
  if (!presetOrCategory) return CATEGORY_THEME_PRESETS.cafe;
  const key = presetOrCategory.toLowerCase().trim() as BusinessCategory;
  return CATEGORY_THEME_PRESETS[key] || CATEGORY_THEME_PRESETS.other || CATEGORY_THEME_PRESETS.cafe;
}
