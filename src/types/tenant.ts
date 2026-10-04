/**
 * Reployty Multi-Tenant Architecture Types
 * 
 * CRITICAL SECURITY INVARIANT:
 * Never trust a frontend-provided business_id for authorization.
 * Backend authorization must always verify:
 * Authenticated User -> Business Membership -> Role/Permission -> Tenant -> Requested Resource.
 */

export type BusinessCategory = 
  | 'cafe'
  | 'restaurant'
  | 'salon'
  | 'gym'
  | 'gamezone'
  | 'retail'
  | 'other';

export type UserRole = 'owner' | 'manager' | 'staff';

export type Permission = 
  | 'manage:business'
  | 'manage:members'
  | 'manage:loyalty'
  | 'manage:rewards'
  | 'manage:campaigns'
  | 'award:stamps'
  | 'redeem:rewards'
  | 'view:analytics'
  | 'view:customers';

export interface BusinessThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  logo?: string;
  backgroundStyle: 'clean' | 'warm' | 'subtle-pattern';
  cardStyle: 'bordered' | 'minimal' | 'elevated';
  fontStyle: 'modern' | 'classic' | 'geometric';
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  category: BusinessCategory;
  tagline?: string;
  logo?: string | null;
  address?: string;
  phone?: string;
  themeConfig: BusinessThemeConfig;
  googleReviewUrl?: string | null;
  createdAt: string;
}

export interface BusinessMembership {
  businessId: string;
  role: UserRole;
  permissions: Permission[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  memberships: BusinessMembership[];
}
