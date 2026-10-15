# DecisionLens Executive Decision Brief

**Topic:** Customer Identity & Authentication Strategy (Managed SaaS vs. In-House Microservice)  
**Session ID:** `sess-arch-2026-auth`  
**Framework Applied:** Multi-Criteria Decision Analysis (MCDA)  
**Date:** October 15, 2026  
**Confidence Score:** 94%  

---

## 1. Executive Summary
The engineering and leadership teams evaluated the strategic trade-offs of using a managed authentication provider (Clerk/Auth0) versus developing an in-house OAuth2/OIDC microservice. The multi-criteria analysis decisively recommends **Option A: Managed Identity Provider**, scoring **8.42/10** compared to **5.39/10** for in-house development.

The decisive factors are an **80% compression of development timeline** (satisfying the hard 6-week enterprise beta deadline) and **pre-certified SOC2 Type II compliance controls**, while total 3-year cost of ownership heavily favors SaaS over recurring engineering maintenance.

---

## 2. Decision Matrix & Scoring Breakdown

| Evaluation Criteria | Weight | Option A: Managed Provider | Option B: In-House Service |
| :--- | :---: | :---: | :---: |
| **Time to Market** | 35% | **9.5** (Score: 3.33) | **3.5** (Score: 1.23) |
| **Security & Compliance** | 30% | **9.2** (Score: 2.76) | **5.8** (Score: 1.74) |
| **Total Cost of Ownership** | 20% | **6.8** (Score: 1.36) | **5.2** (Score: 1.04) |
| **Architecture Portability** | 15% | **6.5** (Score: 0.98) | **9.2** (Score: 1.38) |
| **Composite Score** | **100%** | **8.42 / 10.0** 🥇 | **5.39 / 10.0** |

---

## 3. Key Findings & Trade-Off Analysis
1. **Opportunity Cost of Engineering:** Building authentication in-house diverts 3 senior engineers across 3 critical sprints away from proprietary core recommendation engines.
2. **Compliance & Legal Risk:** An in-house service incurs an estimated $45k in external cryptographic penetration tests and audit verifications, which are inherited for free with a certified vendor.
3. **Unit Economics Reality:** Loaded annual cost of a dedicated maintenance engineer exceeds \$250,000, which surpasses managed SaaS fees up to 350,000 active users.

---

## 4. Actionable Next Steps
- [ ] **Provision Provider Account:** Create staging and production tenants on Clerk / Auth0.
- [ ] **Implement Hexagonal Auth Adapter:** Build a repository interface in FastAPI (`core/auth_adapter.py`) so application routers remain decoupled from vendor SDKs.
- [ ] **Configure Cost Anomaly Alerts:** Set automated alerts at 50k and 100k active user milestones.
