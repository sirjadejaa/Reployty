# Counter QR Standee Deployment Checklist

> **Purpose**: Ensure the physical QR standee is correctly configured, readable, and customer-ready before placing it on the counter.

---

## Pre-Deployment Checks

### QR Destination Verification

- [ ] **Confirm correct business QR URL**: The QR code must point to `https://[production-domain]/#join/[business-slug]`
- [ ] **Verify the slug matches the provisioned business**: The slug is generated during provisioning and must match the business record
- [ ] **Test the URL in a browser**: Open the URL directly and confirm the branded welcome screen loads
- [ ] **Do NOT expose internal admin routes**: The QR must NEVER point to `#admin`, `#dashboard`, `#settings`, or any staff-only route

### QR Readability Testing

- [ ] **Test with iPhone camera** (iOS native camera app — no third-party scanner)
- [ ] **Test with Android camera** (Google Lens / native camera)
- [ ] **Test with at least 2 different phone models**
- [ ] **Test at normal counter distance** (30–60 cm / 12–24 inches)
- [ ] **Test under store lighting conditions** (fluorescent, dim, bright natural light)
- [ ] **Verify QR code is high contrast** (dark code on light background)

### Fresh Session Testing

- [ ] **Open the QR URL from a fresh browser session** (incognito/private mode)
- [ ] **Confirm the join screen loads without errors**
- [ ] **Confirm business name, logo, and branding are correct**
- [ ] **Complete a test join** (use a test phone number if in simulation mode)
- [ ] **Confirm the digital loyalty card renders correctly**

---

## Print-Ready QR Layout

### Design Guidelines

- [ ] **Size**: Minimum 4×6 inches (10×15 cm) for counter standee
- [ ] **QR Code Size**: QR module must be at least 3×3 inches for reliable scanning
- [ ] **Business Logo**: Place above or beside the QR code (do not overlap the QR pattern)
- [ ] **Brand Colors**: Use the business's configured primary color scheme
- [ ] **Include a short customer instruction**, for example:
  > "Scan with your phone camera to collect digital stamps toward a free [reward]!"
- [ ] **Do NOT include**:
  - Internal URLs or localhost references
  - Admin passwords or staff codes
  - Debug information

### Production vs. Demo Labeling

- [ ] **For local demos**: Clearly label the QR material with "DEMONSTRATION ONLY — NOT FOR CUSTOMER USE"
- [ ] **For production pilot**: Remove all demo labels; confirm the URL points to the live production domain

> **HARD RULE**: Do not print or distribute production QR codes until:
> 1. The production domain is confirmed and HTTPS is active
> 2. The business configuration is finalized
> 3. The business owner has approved the standee design

---

## Counter Placement

- [ ] **Position**: Place directly next to the payment terminal or cash register
- [ ] **Visibility**: Customers must be able to see and scan the QR without moving it
- [ ] **Stability**: Use an acrylic standee holder or laminated card with a stand
- [ ] **Accessibility**: QR must be at a height scannable from a typical phone-holding position

---

## Staff Readiness

- [ ] **Staff knows the 1-sentence prompt**: *"Would you like to scan our standee to collect a digital stamp toward a free [reward]?"*
- [ ] **Staff can explain the fallback**: *"If scanning doesn't work, I can help you sign up with your phone number."*
- [ ] **Staff knows NOT to scan the QR for the customer** (customer must use their own device for verification)
