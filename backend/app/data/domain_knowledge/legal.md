# COMMERCIAL CONTRACT & CORPORATE GOVERNANCE STANDARDS: LEGAL DOMAIN KNOWLEDGE BASE
Reference Standards: Indian Contract Act 1872, FTC Non-Compete Rule 2024, California BPC § 16600, Delaware General Corporation Law (DGCL)

## 1. Commercial Contract Risk Ceilings & Liability Architecture
- Aggregate Liability Caps:
  - Standard enterprise practice for B2B software and cloud agreements is to cap direct damages at the total fees paid by the customer in the preceding 12-month period.
  - Fatal Contract Clause: Uncapped direct liability or uncapped consequential damages (loss of profits, business interruption, loss of data) creates existential corporate bankruptcy risk.
  - Mandatory Mutual Consequential Damages Waiver: Contracts must mutually waive indirect, special, incidental, punitive, or consequential damages.
  - Carve-outs from Liability Caps: Standard mutual carve-outs should strictly be limited to:
    1. Gross negligence or willful misconduct.
    2. Third-party IP indemnification obligations.
    3. Breach of confidentiality obligations (often capped at a separate "super-cap", e.g., 2x–3x 12-month fees).
- Indemnification & Defense Boundaries:
  - IP Infringement Defense: Vendor indemnifies customer against claims that vendor's software infringes a third-party copyright, patent, or trade secret.
  - Customer Indemnification: Vendor must insist customer indemnifies vendor against third-party claims arising from customer's unauthorized data input, violation of laws, or breach of acceptable use.

## 2. Restrictive Covenants, Non-Competes & Statutory Enforceability
- Post-Employment Non-Compete Clauses:
  - India: Section 27 of the Indian Contract Act, 1872 explicitly renders any agreement in restraint of trade, profession, or business completely VOID.
    - Landmark Supreme Court Precedent: *Percept D'Mark (India) Pvt. Ltd. v. Zaheer Khan (2006)* confirmed that post-employment negative covenants cannot be enforced against an employee, even if consented to in writing.
  - United States (California): California Business & Professions Code § 16600 voids non-competes regardless of choice of law. California AB 1076 & SB 699 make drafting or attempting to enforce non-competes an unlawful civil violation.
  - Federal Trade Commission (FTC): 16 CFR Part 910 Non-Compete Clause Rule designates employment non-competes as unfair competition.
  - Enforceable Alternative: Non-Disclosure Agreements (NDAs) protecting proprietary trade secrets, combined with reasonable Non-Solicitation clauses (6 to 12 months) covering customers and key personnel.
- Intellectual Property Assignment & Work Made for Hire:
  - Indian Copyright Act, 1957 (Sections 17 and 19): Inventions and code created during the course of employment under a contract of service belong to the employer, BUT assignment must be in writing explicitly specifying the territorial extent and duration; otherwise, rights can revert after 5 years under Section 19(5).

## 3. Dispute Resolution, Governing Law & Exit Governance
- Arbitration & Seat of Governance:
  - Domestic Indian Contracts: Arbitration governed by the Arbitration and Conciliation Act, 1996, with seat specified in Mumbai, Bengaluru, or New Delhi. English language proceedings.
  - International Contracts: Cross-border dispute resolution seated in Singapore (SIAC) or London (LCIA) under English or Delaware law.
- Termination for Convenience vs Cause:
  - Termination for Convenience: If granted to customer, must require minimum 60–90 days written advance notice and forfeiture of prepaid non-refundable implementation / subscription fees.
  - Termination for Cause: Mandatory 30-day written notice with cure period for material breach.
- Data Portability & Certified Hard-Deletion:
  - Contract must define 30-day post-termination window for raw data export (JSON/CSV) followed by certified cryptographic erasure (NIST 800-88 standard).
