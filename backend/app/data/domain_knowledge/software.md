# WELL-ARCHITECTED & SYSTEM DESIGN STANDARDS: SOFTWARE DOMAIN KNOWLEDGE BASE

## 1. Architectural Trade-offs & Distributed Systems (CAP / PACELC)
- Relational (ACID) vs. Non-Relational (NoSQL / BASE):
  - ACID Relational (PostgreSQL, MySQL): Strong consistency, complex joins, normalized schemas, foreign key integrity. Bottleneck: Horizontal write scaling requires sharding.
  - NoSQL Document/Key-Value (MongoDB, DynamoDB): High horizontal write throughput, schema flexibility, partitioning. Bottleneck: Lack of cross-collection transactional guarantees and eventual consistency read lag.
- Statefulness vs. Stateless Scalability:
  - Stateless compute (AWS Lambda, Cloud Run, Kubernetes pods) scales horizontally with zero state synchronization overhead.
  - Stateful workloads (databases, WebSockets, caches) require persistent volumes, replication topologies, connection pooling, and failover orchestrators.

## 2. Operational Reliability & Failure Modes
- Single Points of Failure (SPOF):
  - Any architectural tier without automated multi-zone failover is a reliability vulnerability.
  - Database primary-replica replication must have automated health checks and split-brain prevention (quorum consensus).
- Latency Budgets & Cold Starts:
  - Serverless functions experience cold starts (200ms–2000ms), particularly when deployed inside private VPCs or utilizing heavy runtime runtimes (Java/Python vs. Go/Rust).
  - P99 latency SLA requirements (<100ms) preclude cold-start execution on public-facing critical paths.

## 3. Security, Compliance & Vendor Lock-In
- Cloud Vendor Lock-In Assessment:
  - Proprietary Cloud APIs (e.g., AWS DynamoDB, BigQuery, Step Functions) accelerate initial delivery but introduce high migration friction.
  - Open-Source Standards (PostgreSQL, Kafka, Kubernetes, Redis) maintain cloud portability across AWS, GCP, Azure, and on-premises infrastructure.
- Regulatory & Privacy Baselines:
  - SOC2 Type II: Requires audit logging, centralized IAM with MFA, TLS in transit, AES-256 at rest, and automated vulnerability scanning.
  - GDPR & Data Residency: Explicit consent tracking, right to be forgotten (cascading hard delete), and geographic storage boundaries.
  - HIPAA: Mandatory signed Business Associate Agreements (BAAs) with cloud providers and strict audit trail logging of all protected health information (PHI) access.
