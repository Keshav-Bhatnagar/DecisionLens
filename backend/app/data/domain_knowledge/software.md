# SYSTEM DESIGN & DISTRIBUTED SYSTEMS STANDARDS: SOFTWARE DOMAIN KNOWLEDGE BASE
Reference Standards: GitHub System Design Primer, AWS Well-Architected Framework, Martin Kleppmann (DDIA)

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
