# OPERATIONS, LOGISTICS & SUPPLY CHAIN STANDARDS: OPERATIONS KNOWLEDGE BASE
Reference Standards: APICS / ASCM Supply Chain Operations Reference (SCOR) Model, Six Sigma Quality Standards, Total Quality Management (TQM), Incoterms 2020

## 1. Inventory Optimization, EOQ & Safety Stock Formulas
- Economic Order Quantity (EOQ):
  - Formula: `EOQ = sqrt((2 * Annual Demand (D) * Cost per Order (S)) / Annual Holding Cost per Unit (H))`.
  - Objective: Minimize the sum of setup/ordering costs and inventory holding costs.
  - Holding Cost Benchmark: Annual carrying cost typically represents 20% to 25% of the total unit cost (financing cost, warehouse rent, shrinkage, obsolescence, insurance).
- Safety Stock & Buffer Inventory:
  - Formula: `Safety Stock = Z * sqrt(Average Lead Time * (StdDev Demand)^2 + (Average Demand)^2 * (StdDev Lead Time)^2)`.
  - Service Level (Z-score): 95% service level = Z 1.65; 99% service level = Z 2.33. Aiming for 99.9% service level exponentially inflates inventory working capital without proportional customer value.
- Reorder Point (ROP):
  - Formula: `ROP = (Average Daily Demand * Lead Time in Days) + Safety Stock`.

## 2. Fulfillment Metrics, OTIF & The Bullwhip Effect
- On-Time In-Full (OTIF) Delivery:
  - Formula: `OTIF % = (Orders Delivered On Time AND In Full Quantity / Total Orders) * 100`.
  - Benchmark Thresholds:
    - Tier-1 Enterprise Supply Chain: OTIF >= 95% to 98%.
    - Underperforming / Distressed Vendor: OTIF < 90%. Penalties (Liquidated Damages) should trigger when OTIF drops below 92% for 2 consecutive review periods.
- The Bullwhip Effect & Demand Amplification:
  - Phenomenon: Small fluctuations in consumer demand at the retail level cause progressively larger oscillations at wholesale, distributor, and raw material manufacturer tiers.
  - Mitigations: Vendor-Managed Inventory (VMI), direct Electronic Data Interchange (EDI / API) sharing of Point-of-Sale (POS) demand data, and dampening batch ordering.

## 3. Vendor Procurement, TCO & SLA Governance
- Total Cost of Ownership (TCO) in Sourcing:
  - Sourcing rule: Initial unit purchase price accounts for only 60%–70% of lifecycle cost.
  - Full TCO Equation: `TCO = Unit Purchase Price + Inbound Freight (Incoterms FOB vs DDP) + Customs Tariffs + Quality Scrap/Defect Loss + Warehouse Storage + Cost of Working Capital Locked`.
- Single-Source vs Dual-Sourcing Resilience:
  - Single Point of Failure (SPOF) Risk: Single-sourcing critical components delivers 5%–10% volume discounts but introduces catastrophic supply shutdown vulnerability during strikes, port congestion, or geopolitical sanctions.
  - Strategic Dual-Sourcing Benchmark: 70:30 or 80:20 split between Primary and Secondary verified suppliers ensures warm production capacity during supply disruption.

## 4. Quality Control, Six Sigma & Defect Rates
- Defect Rate Benchmarks (PPM):
  - Parts Per Million (PPM) Defect Metric: `PPM = (Defective Units / Total Units Produced) * 1,000,000`.
  - Six Sigma Quality Target: 3.4 defects per million opportunities (DPMO).
  - First Pass Yield (FPY): Percentage of units manufactured correctly the first time without rework. Target: FPY >= 98.5%.

