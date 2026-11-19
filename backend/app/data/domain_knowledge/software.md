# SYSTEM DESIGN & DISTRIBUTED SYSTEMS STANDARDS: SOFTWARE DOMAIN KNOWLEDGE BASE
Reference Standards: GitHub System Design Primer, AWS Well-Architected Framework, Martin Kleppmann (DDIA), Google SRE Handbook

## 1. Latency Budgets, Hardware Physics & I/O Realities
- Computer Latency Numbers Every Programmer Should Know (Peter Norvig / Jeff Dean):
  - L1 cache reference: 0.5 ns
  - Main memory (RAM) reference: 100 ns
  - NVMe SSD random read: 100 μs
  - Standard SATA SSD random write IOPS threshold: 10,000 to 50,000 IOPS. Assumptions exceeding 50k writes/sec on a single SSD node without sharding, write-batching (WAL group commit), or in-memory queuing violate physical hardware constraints.
  - Same-Datacenter roundtrip network latency: 0.5 ms
  - Cross-Region WAN latency (e.g., US-East to India / Europe): 150 ms – 250 ms.
- Latency SLA Enforcements:
  - P99 latency SLA targets (< 100ms) preclude cold-start execution on critical paths.
  - Serverless functions (AWS Lambda, Cloud Functions) incur cold starts of 250ms–2000ms, particularly when deployed in VPC subnets or utilizing runtime initialization (Java/Python vs Go/Rust).

## 2. Database Architectural Trade-offs & Connection Limits (CAP / PACELC)
- Relational (PostgreSQL, MySQL) vs NoSQL (MongoDB, DynamoDB, Cassandra):
  - ACID Relational: Strong consistency, normalized relations, foreign key cascades, complex multi-table joins. Bottleneck: Horizontal write scaling requires sharding or read-replica connection splitting.
  - Connection Pooling Realities: PostgreSQL processes are process-based (each connection consumes ~10MB RAM). Direct client connections > 100–200 saturate database CPU on context-switching. Connection poolers (PgBouncer, Supavisor, AWS RDS Proxy) are mandatory for serverless or autoscaling compute fleets. Recommended pool size formula: `Pool Size = (2 * CPU Cores) + Effective Spindle / Disk Count`.
  - NoSQL Document / Key-Value: High horizontal write throughput, schema agility. Bottleneck: Eventual consistency read lag, lack of cross-collection multi-document ACID transactions, and costly full-table scans without partition keys.
- Distributed SQL & Consensus (Spanner, CockroachDB, YugabyteDB):
  - Raft / Paxos consensus groups ensure zero data loss (RPO = 0) across multi-zone outages, but incur 2x–3x write latency due to multi-node quorum handshakes before commit acknowledgment.

## 3. Caching Architectures, Memory Footprint & Eviction Policies
- Redis & Memcached Sizing:
  - Redis memory overhead: Pointer overhead and Jemalloc memory fragmentation require budgeting 1.25x–1.35x raw dataset size in RAM.
  - Cache Invalidation & Strategies:
    - Cache-Aside (Lazy Loading): Low risk of cache pollution; stale data window requires TTL (Time-To-Live).
    - Write-Through: Data consistency guaranteed; introduces write latency penalty.
  - Eviction Policies: LRU (Least Recently Used) is default; volatile-lru avoids dropping persistent configuration keys. Cache thundering-herd / dog-piling prevention requires probabilistic early expiration (XFetch algorithm) or distributed mutex locking.

## 4. Operational Reliability, SPOF & Security Compliance
- Single Points of Failure (SPOF) Mitigation:
  - Any architectural tier without automated multi-zone failover (Multi-AZ) is an operational vulnerability.
  - Automated health check probes: Liveness probes (process alive) vs Readiness probes (traffic-ready). Flapping probe thresholds must use exponential backoff to prevent cascading restarts.
- Compliance & Security Guardrails:
  - SOC2 Type II Baseline: Mandatory TLS 1.3 in transit, AES-256 encryption at rest, centralized IAM with MFA, and immutable audit logging preserved for minimum 365 days.
  - Data Residency: Data at rest must physically reside within sovereign jurisdiction as mandated by regional regulations (e.g. Indian DPDP Act, GDPR).

## 5. Cloud Infrastructure Pricing, TCO Formulas & Hidden Cost Traps (AWS / Azure / GCP)
- Compute Cost Models & Serverless Break-Even:
  - AWS Lambda / Google Cloud Run:
    - Pricing formula: $0.20 per 1M requests + $0.0000166667 per GB-second (x86) / $0.0000133334 (Arm Graviton).
    - Break-even rule: If sustained compute utilization exceeds 15%–20% of 24/7 runtime, serverless becomes 40%–60% more expensive than provisioned containers (ECS Fargate with Savings Plans or EKS). Use serverless for bursty, sporadic, or developer-facing workloads.
  - Kubernetes Managed Clusters (AWS EKS, Google GKE, Azure AKS):
    - Cluster Control Plane fee: Fixed $0.10/hour ($73/month flat per cluster on EKS/GKE standard).
    - Node compute: Worker nodes billed by instance type (e.g. c6g.large ~$50/mo, m6g.xlarge ~$112/mo).
    - SRE management overhead: Operating Kubernetes requires minimum 0.5–1.0 dedicated DevOps/SRE engineer FTE ($75k–$150k/year operational cost).
- Network Egress Traps & NAT Gateways:
  - AWS NAT Gateway: $0.045/hour (~$32.40/month per AZ) + $0.045 per GB processed. Deploying multi-AZ NAT gateways costs ~$65/month fixed before processing 1 byte of traffic. Use VPC Endpoints (AWS PrivateLink) for S3 and DynamoDB to bypass NAT data transfer charges.
  - Cross-AZ Data Transfer: Inter-AZ traffic within the same region costs $0.01/GB in each direction ($0.02/GB round-trip). Microservices chatting heavily across AZs incur significant stealth bills.
  - Internet Data Egress: $0.09/GB (AWS/GCP average for first 10TB). High-bandwidth media must use Cloudflare CDN (zero egress) or AWS CloudFront with negotiated commits.
- Managed Database Pricing Realities:
  - AWS Aurora PostgreSQL: Standard tier charges $0.20 per 1M I/O requests. Write-intensive workloads (e.g. analytics, telemetry) can double or triple bills unpredictably; switch to Aurora I/O-Optimized for high I/O predictability.
  - DynamoDB: On-Demand ($1.25 per 1M write units, $0.25 per 1M read units) vs Provisioned with auto-scaling. On-Demand is 5x–7x more expensive for predictable steady-state traffic.

## 6. Architecture Evolution: Monolith vs Microservices vs Modular Monolith
- Conway's Law & Team Sizing Rules:
  - Engineering teams with < 20 developers should strictly adopt a **Modular Monolith** with clean domain boundary packages.
  - Microservices introduce distributed complexity tax: network serialization latency, distributed tracing (OpenTelemetry/Jaeger), eventual consistency bugs, and multi-repository release synchronizations.
- Asynchronous Event-Driven Architectures (Kafka vs RabbitMQ vs SQS/SNS):
  - Apache Kafka: Distributed append-only log. Best for high-throughput streaming (>100k msgs/sec), event sourcing, partition ordering, and multi-consumer replay. Operational burden: Partition rebalancing, broker storage retention, ZooKeeper/KRaft quorum management.
  - RabbitMQ: Push-based AMQP broker. Ideal for complex routing, priority queues, and granular ack/nack task distribution up to 30k msgs/sec.
  - AWS SQS + SNS: Zero-maintenance managed queues. Best for simple decoupled background jobs. Standard SQS is at-least-once delivery (must be idempotent); FIFO SQS is limited to 300–3000 msgs/sec with batching.

## 7. Production SRE, Observability & Rollback Engineering
- Zero-Downtime Deployments & Database Schema Migration:
  - Two-Phase Expand-and-Contract (Parallel Run) is mandatory for zero-downtime database schema changes:
    - Step 1 (Expand): Add new column/table, deploy app code that writes to both old and new columns.
    - Step 2 (Backfill): Run background worker to backfill legacy rows.
    - Step 3 (Contract): Switch reads to new column, stop writing to old column, drop old column in a later release. Never drop/rename columns in the same deployment as code changes.
- Rollback Feasibility:
  - Any architectural decision without a 15-minute rollback procedure (canary traffic shifting or database rollback script) violates production readiness guidelines.
- Observability Triad:
  - Structured JSON logs with trace_id propagation.
  - Prometheus RED metrics (Rate, Errors, Duration) for service endpoints.
  - Distributed tracing (W3C Trace Context) across all async RPC and HTTP boundaries.

## 8. Technology Selection Matrix & Vendor Lock-in Risk
- Proprietary Cloud APIs vs Portable Open Standards:
  - Tier 1 (High Portability): PostgreSQL, Redis, Docker/OCI, Kafka, OpenTelemetry. Near-zero vendor lock-in.
  - Tier 2 (Moderate Portability): AWS S3 (S3 API is an industry de facto standard supported by MinIO, Cloudflare R2, GCP).
  - Tier 3 (High Vendor Lock-in): AWS DynamoDB Streams, Step Functions, Cloudflare Workers KV, GCP BigQuery proprietary SQL extensions. Only choose if velocity advantage significantly outweighs migration switching costs.
