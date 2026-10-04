# REPLOYTY — PHASE 34 INITIAL UI AUDIT REPORT
**UX Refinement, Mobile Responsiveness & Business Branding**
**Date:** October 5, 2026
**Author:** Antigravity AI Engineer

---

## 1. Executive Summary

This audit assesses the current state of Reployty's user interface, responsive layout, form systems, dashboard visual hierarchy, and branding infrastructure across the three mandatory target viewports:
- **Desktop:** 1440 × 900
- **Tablet:** 768 × 1024
- **Mobile:** 390 × 844

The audit confirms real client feedback:
1. **Automation & Shared Forms:** Suffer from double labels, raw HTML controls bypassing the component system, inconsistent padding/margins, cramped 3-column rows inside 520px modals, and arbitrary Tailwind-style utility classes that clash with canonical design tokens.
2. **Mobile Experience:** Modals lack fluid mobile sizing; multi-column form grids risk clipping on narrow devices (390px); touch target sizes on secondary form controls are sub-optimal.
3. **Dashboard:** Feels overly generic; lacks the business owner's logo in the welcome area and workspace header; information hierarchy between setup guides, KPI metrics, action centers, and audit logs can be crisper.
4. **Branding & Logo Infrastructure:** The database (`prisma/schema.prisma`) already possesses `logo String?` on the `Business` model, and `updateBusinessBranding` in `businessService.ts` already persists it with tenant scoping and audit logging. However, neither `BrandingView.tsx` nor `BusinessProfileView.tsx` exposed logo configuration controls, and neither `Header.tsx`, `Sidebar.tsx`, nor `DashboardView.tsx` rendered the configured business logo.

---

## 2. Comprehensive Screen & Component Audit

### 2.1 Form Layouts & Shared Form Primitives

| Component / View | File Path | Defect Observed | Architectural Root Cause |
|---|---|---|---|
| **Automation Rule Modal** | `src/views/business/BusinessAutomationsView.tsx` | Raw `<label>` rendered above `<Input>`, raw `<select>` elements with ad-hoc classes (`py-2 px-3 text-sm`), arbitrary color cards (`bg-brand-50/50`, `bg-gray-50`), cramped 3-col grid in condition section. | Did not use shared `<Select>` or design-token form groups; modal was locked to `520px` width without responsive sizing. |
| **Retention Workflows Modal** | `src/views/business/RetentionWorkflowsSection.tsx` | Double labels; ad-hoc pastel colored backgrounds (`bg-amber-50/50`, `bg-purple-50/50`, `bg-pink-50/50`); cramped grids on small screens. | Inconsistent form markup bypassing `.form-group` and `.form-label`. |
| **Branches View Form** | `src/views/settings/BranchesView.tsx` | Manual `<label style={{ fontSize: '13px', ... }}>` placed above `<Input>`; 3-column row (`City`, `State`, `Postal Code`) squeezed to <140px per field inside modal. | Lack of responsive form container width and duplicated label elements. |
| **Staff Invite / Edit Form** | `src/views/settings/StaffManagementView.tsx` | Raw labels; action buttons at bottom lack sticky or consistent spacing on mobile. | Ad-hoc modal body padding and button layout. |
| **Business Profile Form** | `src/views/settings/BusinessProfileView.tsx` | Form uses page layout well, but lacks dedicated Business Logo management and avatar preview. | Logo field missing from profile editing UI. |
| **Shared Primitives** | `src/styles/components.css`, `layout.css` | Missing `.form-section`, `.form-section-title`, `.form-section-desc`, `.form-actions` shared layout classes for clean grouping. | Design system lacked explicit form sectioning tokens. |

### 2.2 Mobile Responsiveness Audit (390 × 844 & 768 × 1024)

| Area | 1440 × 900 (Desktop) | 768 × 1024 (Tablet) | 390 × 844 (Mobile) | Defect / Needed Refinement |
|---|---|---|---|---|
| **AppShell / Header** | Full sidebar + header | Sidebar collapsed to drawer, hamburger visible | Header search hidden, hamburger toggle active | Header lacks business logo/avatar badge; user avatar exists but no business identity. |
| **Sidebar Switcher** | 2-letter generic initials badge | 2-letter initials badge in mobile drawer | 2-letter initials badge in mobile drawer | Does not render business logo even if configured. |
| **Dashboard** | 4-column KPI grid, 2-column action center | 2-column KPI grid, stacked action center | 2-column or 1-column KPI grid, stacked cards | Welcome banner is text-only; lacks business logo; card margins can be tightened. |
| **Modal Dialogs** | Centered 520px modal | Centered modal with padding | Full width with rounded corners; footer buttons need full width touch targets | Form rows inside modals must stack to 1 column below 640px; modal max-width should be configurable (`max-w-xl` / `640px` for multi-section forms). |
| **Data Tables** | Wide table with borders | Horizontal scroll with smooth touch | Cards view or smooth scroll wrapper | Verify table wrapper has `overflow-x: auto` and `-webkit-overflow-scrolling: touch`. |

### 2.3 Business Logo & Workspace Identity Audit

- **Prisma Schema (`prisma/schema.prisma`):**
  - Line 359: `logo String?` is already defined on `model Business`.
  - Line 360: `coverImage String?` is already defined.
  - Line 361-363: `primaryColor`, `secondaryColor`, `themePreset` already exist.
  - **Result:** No database schema migration needed!
- **Backend Service (`src/server/services/businessService.ts`):**
  - `getBusinessBranding(ctx)` already selects `logo: true`.
  - `updateBusinessBranding(ctx, data)` already accepts `data.logo` and updates `Business.logo` with audit logging `BRANDING_UPDATED`.
  - Missing: Strict validation on `logo` (valid URL or safe data URL, size limit check, SVG sanitization/protocol check).
  - Missing: Exposing `logo` on `updateBusinessProfile` or providing a dedicated logo update mechanism.
- **Frontend Identity Presentation:**
  - `Header.tsx`: Shows `currentBusiness.name` in breadcrumb, but no logo.
  - `Sidebar.tsx`: Shows `.business-avatar-badge` with initial letter, no logo support.
  - `DashboardView.tsx`: Displays greeting with plain text only, no logo badge.
  - `BrandingView.tsx`: Live card preview passes `currentBusiness.themeConfig?.logo || (currentBusiness as any).logo`, but there is no input to set or upload/change the business logo.

---

## 3. Phase 34 Action Plan

1. **Shared Form Component & Token Refinement:**
   - Enhance `src/styles/components.css` with clean form section primitives: `.form-section`, `.form-section-header`, `.form-section-title`, `.form-section-desc`, `.form-grid-2`, `.form-grid-3`, `.form-actions`.
   - Ensure `.form-row-2col` and `.form-row-3col` gracefully collapse to 1 column on mobile (`<640px`) and inside modal viewports.
   - Refine `Input.tsx`, `Select.tsx`, and `Textarea.tsx` for consistent padding, heights (38px desktop, 44px mobile touch-friendly), and clean error/helper message display.
   - Support `maxWidth="640px"` on `Modal.tsx` for multi-section structured forms.
2. **Automation Form Refinement (`BusinessAutomationsView.tsx` & `RetentionWorkflowsSection.tsx`):**
   - Replace raw labels and ad-hoc Tailwind-style selects with standardized `<Input>` and `<Select>`.
   - Group fields into clear, professional sections:
     - *Basic Information* (Name, Description)
     - *Trigger Configuration* (Event Type, Branch Scope)
     - *Condition Rules (IF)* (clean 2-column or stacked layout, no cramped 3-col squeezing)
     - *Action Dispatch (THEN)* (Target Campaign selector using design tokens)
     - *Safeguards & Cooldowns* (Cooldown, Max Executions)
   - Preserve 100% of existing validation, state management, and API calls.
3. **Business Branding & Logo Implementation:**
   - Add safe URL validation (and optional preview) for `logo` on the server in `businessService.ts`.
   - In `BrandingView.tsx` (and `BusinessProfileView.tsx`), add a professional Logo Configuration card:
     - URL input with instant visual preview.
     - Fallback badge generator using business initial and primary color.
     - Logo removal/reset capability.
   - Update `Header.tsx` to render the business logo next to the business name breadcrumb.
   - Update `Sidebar.tsx` to display the business logo inside `.business-switcher-btn` (with initials fallback).
   - Update `DashboardView.tsx` welcome banner with business logo avatar and refined header hierarchy.
4. **Dashboard Visual Polish:**
   - Polish welcome card hierarchy with business identity banner.
   - Improve typography and spacing of KPI cards and Retention Action Center.
   - Preserve all real PostgreSQL data (no fake charts or fake stats).
5. **Quality Assurance & Verification:**
   - Run `npx tsc --noEmit`.
   - Run `npm test` (all 377+ tests must pass).
   - Perform live Browser Visual QA across Desktop (1440×900), Tablet (768×1024), and Mobile (390×844).
