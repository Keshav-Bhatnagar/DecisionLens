# PRODUCT STRATEGY, RETENTION COHORTS & GROWTH EXPERIMENTATION: PRODUCT KNOWLEDGE BASE
Reference Standards: Lenny Rachitsky Product Benchmarks, Reforge Growth Frameworks, Marty Cagan (Empowered), Amplitude Product Analytics

## 1. Retention Mechanics, Cohort Decay & Product-Market Fit
- The Cohort Retention Curve:
  - Benchmark Curve Shape: A healthy product retention curve declines initially and flattens out into a horizontal asymptote parallel to the x-axis. A curve that continually declines toward zero signals a "leaky bucket" / absence of product-market fit (PMF).
  - Retention Benchmarks by Category (Day 30 / Month 3):
    - B2B Enterprise SaaS: Month 12 Gross Revenue Retention (GRR) >= 85% to 90%+; Net Revenue Retention (NRR) >= 110% to 130%.
    - B2B SMB / Self-Serve: Month 3 user retention >= 30% to 40%.
    - B2C Mobile / Freemium: Day 30 user retention >= 20% to 25%.
- Time-to-Value (TTV) & The Activation Milestone:
  - Definition: The moment a new user experiences the core value proposition ("Aha! Moment").
  - Target TTV: < 5 minutes for product-led growth (PLG) self-serve; < 14 days for guided enterprise onboarding.
  - Setup Friction Rule: Every required input field, mandatory SSO step, or unskippable wizard decreases initial onboarding conversion by 10% to 15%.

## 2. Feature Prioritization, Cannibalization & Technical Debt
- RICE Scoring Formula:
  - Formula: `RICE Score = (Reach * Impact * Confidence) / Effort`
  - Reach: Number of users impacted over a defined quarter.
  - Impact: Minimal (0.5), Medium (1.0), High (2.0), Massive (3.0).
  - Confidence: Low (50%), Medium (80%), High (100% - backed by verified user data).
  - Effort: Person-weeks or engineering sprints.
- Feature Cannibalization & Surface Sprawl:
  - Adding a new feature that duplicates 40%+ of an existing workflow degrades product clarity.
  - The "Feature Factory" Anti-Pattern: Shipping 10 features with 2% user adoption instead of iterating on the core 2 workflows that drive 80% of retention.
  - Deprecation Protocol: Any feature with < 5% active monthly usage over 2 consecutive quarters must enter sun-setting evaluation.

## 3. Experimentation Rigor, Statistical Significance & Sample Sizing
- A/B Testing Guardrails:
  - Minimum Statistical Significance: Alpha = 0.05 (p-value < 0.05, 95% confidence interval).
  - Statistical Power: Beta = 0.80 (80% probability of detecting a real effect).
  - Sample Size Pre-determination: Experiments must run for minimum 1 full business cycle (typically 7 to 14 days) to account for day-of-week seasonality, regardless of early sample p-values ("peeking problem").
- Minimum Detectable Effect (MDE):
  - Running low-traffic tests with an MDE > 25% produces high false-positive rates (Type I errors). When traffic is insufficient for statistical significance, abandon A/B testing in favor of qualitative user interviews.

## 4. Churn Deconstruction: Voluntary vs Involuntary
- Involuntary Churn (Payment Gateway & Card Failures):
  - Involuntary payment failure accounts for 20% to 40% of total SaaS customer churn.
  - Mandatory Mitigations: Pre-dunning emails 7 days prior to card expiration, automated retries using smart payment routing (Stripe / Razorpay Smart Retries), and card account updater service.
- Voluntary Churn (Value & Champion Departure):
  - Top root cause in B2B: The internal executive champion who purchased the software left the company, leaving no trained active users.
  - Executive Visibility Rule: Automated weekly or monthly executive ROI digests delivered directly to the budget-holder's inbox prevent contract cancellation at renewal.
