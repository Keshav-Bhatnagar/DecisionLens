"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export interface ShardData {
  id: number;
  col: number;
  row: number;
  name: string;
  tag: string;
  subtitle: string;
  question: string;
  bullets: string[];
}

export const SHARDS_DATA: ShardData[] = [
  {
    id: 0,
    col: 0,
    row: 0,
    name: "Assumptions",
    tag: "01 / PREMISE",
    subtitle: "Untested foundation",
    question: "What are we taking as obvious fact that has never been measured?",
    bullets: [
      "Premise: Cloud migration reduces infrastructure spend within 12 months.",
      "Egress volume and snapshot storage overhead are assumed zero-cost.",
      "Dual-run transition expenses are omitted from cumulative financial models.",
      "Operational cognitive load on a 3-person SRE team is taken as negligible.",
    ],
  },
  {
    id: 1,
    col: 1,
    row: 0,
    name: "Evidence",
    tag: "02 / EMPIRICAL",
    subtitle: "Vendor-sourced skew",
    question: "Is our evidence firsthand telemetry or promotional benchmarks?",
    bullets: [
      "Current on-premise hardware write IOPS peak at 8,200 of 9,000 GP3 limit.",
      "Vendor case studies reflect read-heavy stateless workloads, not write sagas.",
      "Historical query profile confirms 65% catalog lookups, 35% transactional writes.",
      "No internal proof exists that microservices reduce latency on shared ledgers.",
    ],
  },
  {
    id: 2,
    col: 2,
    row: 0,
    name: "Blind spots",
    tag: "03 / GAPS",
    subtitle: "Unresolved dependencies",
    question: "What cutover rollback protocol is completely unestablished?",
    bullets: [
      "No 3-year cumulative operating budget established for managed Kafka clusters.",
      "RBI & DPDP Act Data Localization norms for distributed event logs unreviewed.",
      "Rollback window during quarterly peak release introduces systemic downtime.",
      "Split-brain partition recovery protocol for multi-region state is missing.",
    ],
  },
  {
    id: 3,
    col: 0,
    row: 1,
    name: "Bias",
    tag: "04 / HEURISTICS",
    subtitle: "Sunk cost & comfort",
    question: "Are we choosing technology for fit or because the team likes writing it?",
    bullets: [
      "Sunk Cost Fallacy: 3 weeks spent prototyping Go Kafka consumer drives advocacy.",
      "Status Quo Bias vs Bandwagon Effect: 'Swiggy & Razorpay run microservices'.",
      "Overconfidence bias around zero-downtime database cutover timelines.",
      "Team preferences are treated as architectural justifications in meetings.",
    ],
  },
  {
    id: 4,
    col: 1,
    row: 1,
    name: "Trade-offs",
    tag: "05 / SYMMETRY",
    subtitle: "Compromises declared",
    question: "What explicit monthly cost is accepted for elastic burst capacity?",
    bullets: [
      "Gain elastic burst peak scaling; sacrifice predictable amortized capex.",
      "Incur ₹3.5L/mo managed cluster overhead + distributed tracing complexity.",
      "Independent team releases gained at cost of eventual consistency anomalies.",
      "Every architectural upside must declare its required operational burden.",
    ],
  },
  {
    id: 5,
    col: 2,
    row: 1,
    name: "Alternatives",
    tag: "06 / SPECTRUM",
    subtitle: "Beyond the binary",
    question: "What third option bridges developer velocity and operational sanity?",
    bullets: [
      "Breaks the false binary between 'Total Microservices Cutover' and 'Do Nothing'.",
      "Option C: In-Process Modular Monolith with Redis CQRS cache layer.",
      "Decouple domains in code first; offload 65% of database read bottlenecks.",
      "Extract asynchronous background workers without distributed sagas.",
    ],
  },
];

interface TornDecisionCanvasProps {
  theme: "light" | "dark";
  onChallengeClick?: () => void;
}

export default function TornDecisionCanvas({
  theme,
  onChallengeClick,
}: TornDecisionCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const [selectedShard, setSelectedShard] = useState<ShardData | null>(null);
  const [hoveredShardId, setHoveredShardId] = useState<number | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isTorn, setIsTorn] = useState(false);
  const [isMobileFallback, setIsMobileFallback] = useState(false);
  const [hasWebGL, setHasWebGL] = useState(true);

  const isDark = theme === "dark";

  // Global ESC key listener to dismiss selected shard modal immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedShard(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // WebGL & viewport support check
  useEffect(() => {
    const checkSupport = () => {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const isNarrow = window.innerWidth < 760;

      let webglAvailable = false;
      try {
        const c = document.createElement("canvas");
        webglAvailable = !!(
          window.WebGLRenderingContext &&
          (c.getContext("webgl") || c.getContext("experimental-webgl"))
        );
      } catch {
        webglAvailable = false;
      }

      setHasWebGL(webglAvailable);
      setIsMobileFallback(isNarrow || prefersReducedMotion || !webglAvailable);
    };

    checkSupport();
    window.addEventListener("resize", checkSupport);
    return () => window.removeEventListener("resize", checkSupport);
  }, []);

  // Three.js Interactive WebGL Stage
  useEffect(() => {
    if (isMobileFallback || !hasWebGL || !canvasMountRef.current) return;

    const mount = canvasMountRef.current;
    let width = mount.clientWidth || window.innerWidth;
    let height = mount.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    // Camera positioned for an expansive, authoritative executive memorandum view
    camera.position.set(0, 0, 7.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);

    // 2. Lights
    const ambientLight = new THREE.AmbientLight(0xfffbf5, 1.35);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.15);
    dirLight.position.set(2.5, 4.5, 5.5);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xdbe7ff, 0.4);
    fillLight.position.set(-3, -2, 4);
    scene.add(fillLight);

    // 3. Canvas 2D Textures Generation (Authentic Aged Archival Rag Parchment)
    const W_PX = 2048;
    const H_PX = 1228;

    const drawPaperGrain = (ctx: CanvasRenderingContext2D) => {
      // 1. Aged Parchment Gradient with Sepia Edge Vignette
      const grad = ctx.createRadialGradient(
        W_PX * 0.5,
        H_PX * 0.5,
        W_PX * 0.15,
        W_PX * 0.5,
        H_PX * 0.5,
        W_PX * 0.65
      );
      grad.addColorStop(0, "#F7F2E7");
      grad.addColorStop(0.65, "#EFE7D5");
      grad.addColorStop(0.92, "#E4D9C0");
      grad.addColorStop(1, "#D6C7A9");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W_PX, H_PX);

      // 2. Organic Cotton Rag Pulp Fibers
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4500; i++) {
        const fx = Math.random() * W_PX;
        const fy = Math.random() * H_PX;
        const fLen = 3 + Math.random() * 8;
        const fAng = Math.random() * Math.PI * 2;
        const alpha = 0.02 + Math.random() * 0.04;
        ctx.strokeStyle =
          Math.random() > 0.4
            ? `rgba(60, 42, 24, ${alpha})`
            : `rgba(43, 76, 140, ${alpha * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(
          fx + Math.cos(fAng) * fLen * 0.5 + (Math.random() - 0.5) * 3,
          fy + Math.sin(fAng) * fLen * 0.5 + (Math.random() - 0.5) * 3,
          fx + Math.cos(fAng) * fLen,
          fy + Math.sin(fAng) * fLen
        );
        ctx.stroke();
      }

      // 3. Antique Foxing & Water Spots
      for (let i = 0; i < 35; i++) {
        const sx = Math.random() * W_PX;
        const sy = Math.random() * H_PX;
        const sr = 15 + Math.random() * 45;
        const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        sGrad.addColorStop(0, "rgba(130, 95, 55, 0.035)");
        sGrad.addColorStop(0.6, "rgba(110, 80, 45, 0.02)");
        sGrad.addColorStop(1, "rgba(100, 70, 40, 0.0)");
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Faint Vintage Ledger Rulings
      ctx.strokeStyle = "rgba(115, 90, 65, 0.06)";
      ctx.lineWidth = 1;
      for (let y = 140; y < H_PX - 80; y += 72) {
        ctx.beginPath();
        ctx.moveTo(110, y);
        ctx.lineTo(W_PX - 110, y);
        ctx.stroke();
      }

      // Vertical margin guide line (red/sepia ledger margin)
      ctx.strokeStyle = "rgba(165, 60, 45, 0.07)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(260, 80);
      ctx.lineTo(260, H_PX - 80);
      ctx.stroke();
    };

    // tA: Intact sheet "FINAL"
    const cvA = document.createElement("canvas");
    cvA.width = W_PX;
    cvA.height = H_PX;
    const cxA = cvA.getContext("2d")!;
    drawPaperGrain(cxA);

    cxA.fillStyle = "#1d1d1b";
    cxA.font = "bold 26px 'Courier Prime', Courier, monospace";
    cxA.fillText("DECISION / 001 / STATUS: FINAL", 140, 160);

    cxA.font = "bold 22px 'Courier Prime', Courier, monospace";
    cxA.fillStyle = "#4f4b40";
    cxA.fillText("AUTHORITY: EXECUTIVE ARCHITECTURE BOARD", 140, 210);

    cxA.fillStyle = "#1d1d1b";
    cxA.font = "500 58px 'Newsreader', Georgia, serif";
    cxA.fillText(
      "“Should we migrate our production infrastructure to the cloud?”",
      140,
      480
    );

    cxA.fillStyle = "#2B4C8C";
    cxA.font = "italic 38px 'Newsreader', Georgia, serif";
    cxA.fillText("Decided. No further questions.", 140, 680);

    cxA.strokeStyle = "rgba(29, 29, 27, 0.35)";
    cxA.lineWidth = 2;
    cxA.strokeRect(100, 100, W_PX - 200, H_PX - 200);

    const tA = new THREE.CanvasTexture(cvA);
    tA.minFilter = THREE.LinearFilter;
    tA.generateMipmaps = false;

    // tB: Challenged sheet with strike-through and handwritten notes
    const cvB = document.createElement("canvas");
    cvB.width = W_PX;
    cvB.height = H_PX;
    const cxB = cvB.getContext("2d")!;
    drawPaperGrain(cxB);

    cxB.fillStyle = "#1d1d1b";
    cxB.font = "bold 26px 'Courier Prime', Courier, monospace";
    cxB.fillText("DECISION / 001 / STATUS: UNDER SCRUTINY", 140, 160);

    cxB.font = "500 58px 'Newsreader', Georgia, serif";
    cxB.fillText(
      "“Should we migrate our production infrastructure to the cloud?”",
      140,
      480
    );

    // Struck-through text
    cxB.fillStyle = "rgba(29, 29, 27, 0.4)";
    cxB.font = "italic 38px 'Newsreader', Georgia, serif";
    cxB.fillText("Decided. No further questions.", 140, 680);

    cxB.strokeStyle = "#2B4C8C";
    cxB.lineWidth = 4;
    cxB.beginPath();
    cxB.moveTo(135, 668);
    cxB.lineTo(650, 668);
    cxB.stroke();

    // Handwritten blue challenger notes (iron-gall blue ink)
    cxB.fillStyle = "#1b3b6f";
    cxB.font = "italic bold 34px 'Newsreader', Georgia, serif";
    cxB.fillText("Says who? Based on what evidence?", 720, 660);
    cxB.fillText("Cost vs. what? (Egress ₹3.5L/mo)", 320, 840);
    cxB.fillText("Who owns the move? (3 SREs only)", 1100, 360);
    cxB.fillText("Vendor lock-in? RBI compliance?", 1180, 860);

    const tB = new THREE.CanvasTexture(cvB);
    tB.minFilter = THREE.LinearFilter;
    tB.generateMipmaps = false;

    // tL: Shard labels at UV centroids
    const cvL = document.createElement("canvas");
    cvL.width = W_PX;
    cvL.height = H_PX;
    const cxL = cvL.getContext("2d")!;
    drawPaperGrain(cxL);

    // tQ: Shard challenging questions in blue italic
    const cvQ = document.createElement("canvas");
    cvQ.width = W_PX;
    cvQ.height = H_PX;
    const cxQ = cvQ.getContext("2d")!;
    drawPaperGrain(cxQ);

    // Centroids for 3 cols x 2 rows
    const colCenters = [W_PX * 0.167, W_PX * 0.5, W_PX * 0.833];
    const rowCenters = [H_PX * 0.25, H_PX * 0.75];

    SHARDS_DATA.forEach((s) => {
      const cx = colCenters[s.col];
      const cy = rowCenters[s.row];

      // Draw label
      cxL.fillStyle = "#2B4C8C";
      cxL.font = "bold 24px 'Courier Prime', Courier, monospace";
      cxL.textAlign = "center";
      cxL.fillText(s.tag, cx, cy - 36);

      cxL.fillStyle = "#1d1d1b";
      cxL.font = "bold 38px 'Newsreader', Georgia, serif";
      cxL.fillText(s.name, cx, cy + 10);

      cxL.fillStyle = "#4f4b40";
      cxL.font = "italic 22px 'Courier Prime', Courier, monospace";
      cxL.fillText(s.subtitle, cx, cy + 50);

      // Draw Question on tQ
      cxQ.fillStyle = "#1b3b6f";
      cxQ.font = "italic bold 32px 'Newsreader', Georgia, serif";
      cxQ.textAlign = "center";

      const words = s.question.split(" ");
      const mid = Math.ceil(words.length / 2);
      const line1 = words.slice(0, mid).join(" ");
      const line2 = words.slice(mid).join(" ");
      cxQ.fillText(line1, cx, cy - 10);
      cxQ.fillText(line2, cx, cy + 32);
    });

    const tL = new THREE.CanvasTexture(cvL);
    tL.minFilter = THREE.LinearFilter;
    tL.generateMipmaps = false;

    const tQ = new THREE.CanvasTexture(cvQ);
    tQ.minFilter = THREE.LinearFilter;
    tQ.generateMipmaps = false;

    // 4. Shared ShaderMaterial
    const shaderUniforms = {
      tA: { value: tA },
      tB: { value: tB },
      tL: { value: tL },
      tQ: { value: tQ },
      uTear: { value: 0.0 },
      uLens: { value: new THREE.Vector2(-999, -999) },
      uR: { value: 120.0 },
    };

    const shardMaterial = new THREE.ShaderMaterial({
      uniforms: shaderUniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vNormal = normal;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tA;
        uniform sampler2D tB;
        uniform sampler2D tL;
        uniform sampler2D tQ;
        uniform float uTear;
        uniform vec2 uLens;
        uniform float uR;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldNormal;

        void main() {
          vec4 colA = texture2D(tA, vUv);
          vec4 colB = texture2D(tB, vUv);
          vec4 colL = texture2D(tL, vUv);
          vec4 colQ = texture2D(tQ, vUv);

          vec4 base = mix(colA, colL, uTear);
          vec4 reveal = mix(colB, colQ, uTear);

          float d = distance(gl_FragCoord.xy, uLens);
          float inLens = 1.0 - smoothstep(uR - 2.5, uR + 2.5, d);
          vec4 col = mix(base, reveal, inLens);

          // Front cap (normal.z > 0.5) gets texture
          // Back cap (normal.z < -0.5) is aged warm parchment paper
          // Side walls are fibrous paper-edge colour
          if (vNormal.z < -0.5) {
            col = vec4(0.93, 0.89, 0.82, 1.0);
          } else if (abs(vNormal.z) <= 0.5) {
            col = vec4(0.84, 0.78, 0.68, 1.0);
          }

          // Shading as shards rotate
          vec3 lightDir = normalize(vec3(0.35, 0.55, 1.0));
          float light = 0.78 + 0.26 * abs(dot(normalize(vWorldNormal), lightDir));
          col.rgb *= light;

          gl_FragColor = col;
        }
      `,
      side: THREE.DoubleSide,
    });

    // 5. Build 6 Shards with Multi-Octave Organic Deckle Edges
    const SHEET_W = 4.8;
    const SHEET_H = 2.88;
    const COLS = 3;
    const ROWS = 2;

    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    const edgeCache = new Map<string, THREE.Vector2[]>();

    const getJaggedEdge = (
      p1: THREE.Vector2,
      p2: THREE.Vector2,
      numSegments = 24,
      seedOffset = 1
    ) => {
      const k1 = `${p1.x.toFixed(3)},${p1.y.toFixed(3)}`;
      const k2 = `${p2.x.toFixed(3)},${p2.y.toFixed(3)}`;
      const isReversed = k1 > k2;
      const key = isReversed ? `${k2}__${k1}` : `${k1}__${k2}`;

      if (!edgeCache.has(key)) {
        const start = isReversed ? p2 : p1;
        const end = isReversed ? p1 : p2;
        const pts: THREE.Vector2[] = [start.clone()];

        const dir = new THREE.Vector2().subVectors(end, start);
        const len = dir.length();
        const norm = new THREE.Vector2(-dir.y, dir.x).normalize();

        for (let i = 1; i < numSegments; i++) {
          const t = i / numSegments;
          const basePt = new THREE.Vector2().addVectors(
            start,
            dir.clone().multiplyScalar(t)
          );

          // Multi-octave fractal tear curve (organic rag paper deckle)
          const envelope = Math.sin(t * Math.PI);
          const macroJitter = (seededRandom(seedOffset + 7) - 0.5) * 0.14 * len * envelope;
          const clumpJitter = (seededRandom(seedOffset + i * 37) - 0.5) * 0.06 * len;
          const microFibers = (seededRandom(seedOffset + i * 193) - 0.5) * 0.025 * len;

          const totalJitter = macroJitter + clumpJitter + microFibers;
          basePt.add(norm.clone().multiplyScalar(totalJitter));
          pts.push(basePt);
        }
        pts.push(end.clone());
        edgeCache.set(key, pts);
      }

      const cached = edgeCache.get(key)!;
      if (isReversed) {
        return cached.slice().reverse();
      }
      return cached.slice();
    };

    // Grid coordinates
    const gridX = [-2.4, -0.8, 0.8, 2.4];
    const gridY = [1.44, 0.0, -1.44];

    interface ShardMeshMeta {
      mesh: THREE.Mesh;
      initialPos: THREE.Vector3;
      targetPos: THREE.Vector3;
      targetRot: THREE.Euler;
      outline: THREE.LineLoop;
      data: ShardData;
    }

    const shardMeshes: ShardMeshMeta[] = [];
    const shardGroup = new THREE.Group();
    // Substantial executive document scale (1.08) - prominent, bold, and commanding on screen
    shardGroup.position.set(0, -0.06, 0);
    shardGroup.scale.set(1.08, 1.08, 1.08);
    scene.add(shardGroup);

    SHARDS_DATA.forEach((s) => {
      const c = s.col;
      const r = s.row;

      const tl = new THREE.Vector2(gridX[c], gridY[r]);
      const tr = new THREE.Vector2(gridX[c + 1], gridY[r]);
      const br = new THREE.Vector2(gridX[c + 1], gridY[r + 1]);
      const bl = new THREE.Vector2(gridX[c], gridY[r + 1]);

      const topPts =
        r === 0 ? getJaggedEdge(tl, tr, 16, (c + 1) * 73) : getJaggedEdge(tl, tr, 26, (c + 1) * 101);
      const rightPts =
        c === COLS - 1
          ? getJaggedEdge(tr, br, 16, (c + r + 2) * 137)
          : getJaggedEdge(tr, br, 26, (c + r + 2) * 211);
      const bottomPts =
        r === ROWS - 1 ? getJaggedEdge(br, bl, 16, (c + 3) * 199) : getJaggedEdge(br, bl, 26, (c + 3) * 307);
      const leftPts =
        c === 0
          ? getJaggedEdge(bl, tl, 16, (c + r + 4) * 269)
          : getJaggedEdge(bl, tl, 26, (c + r + 4) * 401);

      const shape = new THREE.Shape();
      const allPts = [
        ...topPts,
        ...rightPts.slice(1),
        ...bottomPts.slice(1),
        ...leftPts.slice(1),
      ];

      shape.moveTo(allPts[0].x, allPts[0].y);
      for (let i = 1; i < allPts.length; i++) {
        shape.lineTo(allPts[i].x, allPts[i].y);
      }
      shape.closePath();

      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.045,
        bevelEnabled: false,
      });

      const posAttr = geom.attributes.position;
      const uvAttr = geom.attributes.uv;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i);
        const z = posAttr.getZ(i);
        const u = (x + SHEET_W * 0.5) / SHEET_W;
        const v = (y + SHEET_H * 0.5) / SHEET_H;
        uvAttr.setXY(i, u, v);

        // Tactile Archival Paper Curl: continuous global sheet curl (zero seam gaps between shards)
        const curl =
          Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * -0.015 +
          (u - 0.5) * (v - 0.5) * 0.025;
        posAttr.setZ(i, z + curl);
      }
      uvAttr.needsUpdate = true;
      posAttr.needsUpdate = true;
      geom.computeVertexNormals();

      geom.computeBoundingBox();
      const bbox = geom.boundingBox!;
      const centroid = new THREE.Vector3();
      bbox.getCenter(centroid);
      geom.translate(-centroid.x, -centroid.y, -centroid.z);

      const mesh = new THREE.Mesh(geom, shardMaterial);
      mesh.position.copy(centroid);
      mesh.userData = { shardId: s.id };

      const outlinePts = allPts.map(
        (p) => new THREE.Vector3(p.x - centroid.x, p.y - centroid.y, 0.032)
      );
      const outlineGeom = new THREE.BufferGeometry().setFromPoints(outlinePts);
      const outlineMat = new THREE.LineBasicMaterial({
        color: 0x7c6248,
        transparent: true,
        opacity: 0.0,
      });
      const outline = new THREE.LineLoop(outlineGeom, outlineMat);
      mesh.add(outline);

      const driftX = (c - 1) * 0.55 + (seededRandom(s.id * 13) - 0.5) * 0.15;
      const driftY = (0.5 - r) * 0.38 + (seededRandom(s.id * 29) - 0.5) * 0.12;
      const driftZ = 0.25 + seededRandom(s.id * 47) * 0.5;

      const targetPos = new THREE.Vector3(
        centroid.x + driftX,
        centroid.y + driftY,
        centroid.z + driftZ
      );

      const targetRot = new THREE.Euler(
        (seededRandom(s.id * 71) - 0.5) * 0.38,
        (seededRandom(s.id * 83) - 0.5) * 0.38,
        (seededRandom(s.id * 97) - 0.5) * 0.28
      );

      shardGroup.add(mesh);
      shardMeshes.push({
        mesh,
        initialPos: centroid.clone(),
        targetPos,
        targetRot,
        outline,
        data: s,
      });
    });

    // 6. Antique Victorian Optical Loupe (Antique Brass Bezel + Mechanical Joint + Turned Walnut Handle)
    const lensGroup = new THREE.Group();
    const idleLensPos = new THREE.Vector3(2.5, -0.2, 3.5);
    lensGroup.position.copy(idleLensPos);
    scene.add(lensGroup);

    const antiqueBrassMat = new THREE.MeshStandardMaterial({
      color: 0xc49b4b,
      metalness: 0.88,
      roughness: 0.28,
    });
    const agedBronzeMat = new THREE.MeshStandardMaterial({
      color: 0x7c5d2c,
      metalness: 0.82,
      roughness: 0.4,
    });
    const turnedWoodMat = new THREE.MeshStandardMaterial({
      color: 0x24160f,
      roughness: 0.48,
      metalness: 0.12,
    });

    const LENS_R = 0.28;

    // 6a. Outer Stepped Brass Bezel Ring
    const torusGeom = new THREE.TorusGeometry(LENS_R, 0.026, 20, 64);
    const brassRing = new THREE.Mesh(torusGeom, antiqueBrassMat);
    lensGroup.add(brassRing);

    const innerRimGeom = new THREE.TorusGeometry(LENS_R - 0.018, 0.012, 16, 48);
    const innerRim = new THREE.Mesh(innerRimGeom, agedBronzeMat);
    lensGroup.add(innerRim);

    // 6b. Antique Double-Convex Optical Glass Lens
    const glassGeom = new THREE.SphereGeometry(
      LENS_R - 0.01,
      32,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.3
    );
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xdff5ee,
      roughness: 0.06,
      metalness: 0.16,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const glassTop = new THREE.Mesh(glassGeom, glassMat);
    glassTop.scale.set(1.0, 1.0, 0.09);
    glassTop.position.z = 0.01;
    lensGroup.add(glassTop);

    const glassBottom = new THREE.Mesh(glassGeom, glassMat);
    glassBottom.scale.set(1.0, 1.0, -0.09);
    glassBottom.position.z = -0.01;
    lensGroup.add(glassBottom);

    // 6c. Authentic Mechanical Mounting Joint & Turned Handle
    const handleAssembly = new THREE.Group();
    handleAssembly.rotation.z = -Math.PI / 4;
    lensGroup.add(handleAssembly);

    const jointStartY = -LENS_R;

    const lugGeom = new THREE.CylinderGeometry(0.026, 0.028, 0.05, 16);
    const lugMesh = new THREE.Mesh(lugGeom, antiqueBrassMat);
    lugMesh.position.set(0, jointStartY - 0.025, 0);
    handleAssembly.add(lugMesh);

    const ferruleUpperGeom = new THREE.CylinderGeometry(0.03, 0.034, 0.04, 20);
    const ferruleUpper = new THREE.Mesh(ferruleUpperGeom, antiqueBrassMat);
    ferruleUpper.position.set(0, jointStartY - 0.065, 0);
    handleAssembly.add(ferruleUpper);

    const knurlGeom = new THREE.TorusGeometry(0.035, 0.007, 12, 24);
    const knurlMesh = new THREE.Mesh(knurlGeom, agedBronzeMat);
    knurlMesh.rotation.x = Math.PI / 2;
    knurlMesh.position.set(0, jointStartY - 0.085, 0);
    handleAssembly.add(knurlMesh);

    const ferruleLowerGeom = new THREE.CylinderGeometry(0.035, 0.038, 0.05, 20);
    const ferruleLower = new THREE.Mesh(ferruleLowerGeom, antiqueBrassMat);
    ferruleLower.position.set(0, jointStartY - 0.11, 0);
    handleAssembly.add(ferruleLower);

    const handleStemGeom = new THREE.CylinderGeometry(0.028, 0.038, 0.50, 24);
    const handleStem = new THREE.Mesh(handleStemGeom, turnedWoodMat);
    handleStem.position.set(0, jointStartY - 0.38, 0);
    handleAssembly.add(handleStem);

    const midRibGeom = new THREE.TorusGeometry(0.035, 0.005, 12, 24);
    const midRib = new THREE.Mesh(midRibGeom, antiqueBrassMat);
    midRib.rotation.x = Math.PI / 2;
    midRib.position.set(0, jointStartY - 0.38, 0);
    handleAssembly.add(midRib);

    const pommelGeom = new THREE.SphereGeometry(0.032, 20, 20);
    const pommelMesh = new THREE.Mesh(pommelGeom, antiqueBrassMat);
    pommelMesh.position.set(0, jointStartY - 0.65, 0);
    handleAssembly.add(pommelMesh);

    // 7. Blue Threads (QuadraticBezierCurve3) linking dependent shards
    const threadPairs = [
      [0, 2], // Assumptions - Blind spots
      [1, 0], // Evidence - Assumptions
      [3, 0], // Bias - Assumptions
      [4, 5], // Trade-offs - Alternatives
      [2, 4], // Blind spots - Trade-offs
      [3, 4], // Bias - Trade-offs
    ];

    interface ThreadLineMeta {
      curve: THREE.QuadraticBezierCurve3;
      geom: THREE.BufferGeometry;
      line: THREE.Line;
      idxA: number;
      idxB: number;
    }

    const threadLines: ThreadLineMeta[] = [];
    const threadMat = new THREE.LineBasicMaterial({
      color: 0x2b4c8c,
      transparent: true,
      opacity: 0.0,
      linewidth: 1.5,
    });

    threadPairs.forEach(([idxA, idxB]) => {
      const pA = shardMeshes[idxA].mesh.position;
      const pB = shardMeshes[idxB].mesh.position;
      const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
      mid.y -= 0.3;
      mid.z += 0.45;

      const curve = new THREE.QuadraticBezierCurve3(pA.clone(), mid, pB.clone());
      const geom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
      const line = new THREE.Line(geom, threadMat.clone());
      shardGroup.add(line);

      threadLines.push({ curve, geom, line, idxA, idxB });
    });

    // 8. Floating Paper Flecks (~120 points)
    const FLECK_COUNT = 120;
    const fleckPositions = new Float32Array(FLECK_COUNT * 3);
    for (let i = 0; i < FLECK_COUNT; i++) {
      fleckPositions[i * 3 + 0] = (Math.random() - 0.5) * 7.5;
      fleckPositions[i * 3 + 1] = (Math.random() - 0.5) * 4.8;
      fleckPositions[i * 3 + 2] = Math.random() * 3.0;
    }
    const flecksGeom = new THREE.BufferGeometry();
    flecksGeom.setAttribute("position", new THREE.BufferAttribute(fleckPositions, 3));
    const flecksMat = new THREE.PointsMaterial({
      color: 0xede7d6,
      size: 0.045,
      transparent: true,
      opacity: 0.0,
    });
    const flecksPoints = new THREE.Points(flecksGeom, flecksMat);
    scene.add(flecksPoints);

    // 9. Pointer Tracking & Raycasting
    const pointer = new THREE.Vector2(-999, -999);
    const targetLensPos = idleLensPos.clone();
    const raycaster = new THREE.Raycaster();
    const planeZ35 = new THREE.Plane(new THREE.Vector3(0, 0, 1), -3.5);

    const onPointerMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      pointer.set(x, y);

      raycaster.setFromCamera(pointer, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(planeZ35, hit)) {
        targetLensPos.set(
          THREE.MathUtils.clamp(hit.x, -2.6, 2.6),
          THREE.MathUtils.clamp(hit.y, -1.2, 0.9),
          3.5
        );
      }
    };

    const onPointerLeave = () => {
      targetLensPos.copy(idleLensPos);
    };

    mount.addEventListener("mousemove", onPointerMove);
    mount.addEventListener("mouseleave", onPointerLeave);

    // 10. Shard Click & Raycast Selection
    const onCanvasClick = () => {
      if (shaderUniforms.uTear.value < 0.25) return;
      raycaster.setFromCamera(pointer, camera);
      const meshes = shardMeshes.map((s) => s.mesh);
      const intersects = raycaster.intersectObjects(meshes, true);
      if (intersects.length > 0) {
        const topHit = intersects[0].object;
        const meshParent =
          topHit instanceof THREE.Mesh ? topHit : (topHit.parent as THREE.Mesh);
        const sId = meshParent?.userData?.shardId;
        if (sId !== undefined) {
          const match = SHARDS_DATA.find((sd) => sd.id === sId);
          if (match) setSelectedShard(match);
        }
      }
    };

    mount.addEventListener("click", onCanvasClick);

    // 11. Render Loop & Animation Choreography
    let animationFrameId: number;
    let isVisible = true;
    let clock = new THREE.Clock();

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    observer.observe(mount);

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth lerp lens (park gently to the side if a shard is actively being inspected)
      if (selectedShard) {
        targetLensPos.set(-2.5, -0.4, 3.5);
      }
      lensGroup.position.lerp(targetLensPos, 0.12);

      // Animate shards every frame with smooth easing
      const easedTear = shaderUniforms.uTear.value;

      // Gentle organic sheet breathing before tear
      if (easedTear < 0.05) {
        shardGroup.position.y = -0.08 + Math.sin(elapsed * 1.5) * 0.025;
      } else {
        shardGroup.position.y = -0.08;
      }

      shardMeshes.forEach(({ mesh, initialPos, targetPos, targetRot, outline, data }) => {
        // Shard outline only reveals once paper begins tearing apart
        (outline.material as THREE.LineBasicMaterial).opacity = Math.min(easedTear * 0.5, 0.32);

        if (selectedShard) {
          // All background shards gently recede to provide serene depth
          const recedePos = targetPos.clone().add(new THREE.Vector3(0, 0, -2.5));
          mesh.position.lerp(recedePos, 0.08);
          mesh.scale.lerp(new THREE.Vector3(0.75, 0.75, 0.75), 0.08);
        } else {
          // Normal scroll drift
          const curPos = new THREE.Vector3().lerpVectors(
            initialPos,
            targetPos,
            easedTear
          );

          mesh.position.lerp(curPos, 0.1);
          mesh.rotation.set(
            targetRot.x * easedTear,
            targetRot.y * easedTear,
            targetRot.z * easedTear
          );

          if (hoveredShardId === data.id && easedTear > 0.3) {
            mesh.position.z += 0.25;
            mesh.scale.lerp(new THREE.Vector3(1.06, 1.06, 1.06), 0.1);
          } else {
            mesh.scale.lerp(new THREE.Vector3(1.0, 1.0, 1.0), 0.1);
          }
        }
      });

      // Project lens center and radius to screen device coordinates
      const lensScreen = lensGroup.position.clone().project(camera);
      const pxRatio = renderer.getPixelRatio();
      const screenX = (lensScreen.x * 0.5 + 0.5) * width * pxRatio;
      const screenY = (lensScreen.y * 0.5 + 0.5) * height * pxRatio;
      shaderUniforms.uLens.value.set(screenX, screenY);

      // Estimate pixel radius of lens on screen
      const edgePt = lensGroup.position.clone().add(new THREE.Vector3(LENS_R, 0, 0));
      const edgeScreen = edgePt.project(camera);
      const radiusPx = Math.abs(edgeScreen.x - lensScreen.x) * 0.5 * width * pxRatio;
      shaderUniforms.uR.value = Math.max(radiusPx, 30.0);

      // Raycast hover check after tear
      if (shaderUniforms.uTear.value >= 0.25 && !selectedShard) {
        raycaster.setFromCamera(pointer, camera);
        const meshes = shardMeshes.map((s) => s.mesh);
        const hits = raycaster.intersectObjects(meshes, true);
        if (hits.length > 0) {
          const hId = hits[0].object?.userData?.shardId;
          setHoveredShardId(hId !== undefined ? hId : null);
          mount.style.cursor = "pointer";
        } else {
          setHoveredShardId(null);
          mount.style.cursor = "default";
        }
      } else {
        setHoveredShardId(null);
        mount.style.cursor = "default";
      }

      // Update Blue Drooping Threads
      const tearVal = shaderUniforms.uTear.value;
      const threadOpacity = THREE.MathUtils.clamp((tearVal - 0.2) * 1.5, 0.0, 0.65);
      threadLines.forEach(({ curve, geom, line, idxA, idxB }) => {
        (line.material as THREE.LineBasicMaterial).opacity = threadOpacity;
        const pA = shardMeshes[idxA].mesh.position;
        const pB = shardMeshes[idxB].mesh.position;
        curve.v0.copy(pA);
        curve.v2.copy(pB);
        curve.v1.addVectors(pA, pB).multiplyScalar(0.5);
        curve.v1.y -= 0.3;
        curve.v1.z += 0.45;
        geom.setFromPoints(curve.getPoints(24));
      });

      // Update Flecks drift
      if (tearVal > 0.15) {
        flecksMat.opacity = Math.min((tearVal - 0.15) * 1.2, 0.4);
        const posArr = flecksGeom.attributes.position.array as Float32Array;
        for (let i = 0; i < FLECK_COUNT; i++) {
          posArr[i * 3 + 1] += Math.sin(elapsed + i) * 0.0012;
          posArr[i * 3 + 0] += Math.cos(elapsed * 0.5 + i) * 0.001;
        }
        flecksGeom.attributes.position.needsUpdate = true;
      } else {
        flecksMat.opacity = 0.0;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 12. Scroll Handler for Pinned Choreography
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalH = containerRef.current.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      const p = THREE.MathUtils.clamp(scrolled / Math.max(totalH, 1), 0, 1);
      setScrollProgress(p);

      // Hold intact for first 15% of pinned scroll so the document is completely unbroken upon entering
      const tearProgress = THREE.MathUtils.clamp((p - 0.15) / 0.38, 0, 1);
      const easedTear =
        tearProgress < 0.5
          ? 2 * tearProgress * tearProgress
          : 1 - Math.pow(-2 * tearProgress + 2, 2) / 2;

      shaderUniforms.uTear.value = easedTear;
      setIsTorn(easedTear > 0.20);

      if (p >= 0.65) {
        const orbitP = (p - 0.65) / 0.35;
        shardGroup.rotation.y = orbitP * 0.32;
      } else {
        shardGroup.rotation.y = 0;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    const handleResize = () => {
      width = mount.clientWidth || window.innerWidth;
      height = mount.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      mount.removeEventListener("mousemove", onPointerMove);
      mount.removeEventListener("mouseleave", onPointerLeave);
      mount.removeEventListener("click", onCanvasClick);
      cancelAnimationFrame(animationFrameId);

      tA.dispose();
      tB.dispose();
      tL.dispose();
      tQ.dispose();
      shardMaterial.dispose();
      antiqueBrassMat.dispose();
      agedBronzeMat.dispose();
      turnedWoodMat.dispose();
      glassMat.dispose();
      renderer.dispose();
      if (renderer.domElement && mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [isMobileFallback, hasWebGL, selectedShard, hoveredShardId]);

  const scrollToTearPoint = () => {
    if (!containerRef.current) return;
    const top = containerRef.current.offsetTop;
    const tearOffset = window.innerHeight * 0.9;
    window.scrollTo({
      top: top + tearOffset,
      behavior: "smooth",
    });
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${
        isMobileFallback ? "min-h-auto py-16" : "h-[260vh]"
      }`}
    >
      {/* Sticky 100vh Stage for 3D Viewport */}
      {!isMobileFallback ? (
        <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col justify-between select-none">
          {/* Section Dynamic Headline: Positioned with generous vertical margin */}
          <div className="relative z-20 pt-8 sm:pt-10 px-6 sm:px-12 text-center pointer-events-none max-w-2xl mx-auto">
            <span
              className={`text-[11px] font-courier tracking-[0.2em] uppercase font-bold block mb-1 ${
                isDark ? "text-[#D4AA50]" : "text-[#2F5D8F]"
              }`}
            >
              DECONSTRUCTION
            </span>
            <h2
              className={`font-newsreader text-2xl sm:text-4xl font-normal transition-all duration-500 ${
                isDark ? "text-[#F0EAE1]" : "text-[#161E33]"
              }`}
            >
              {isTorn
                ? "Six fault lines. Pick a shard."
                : "It looks final. It isn't."}
            </h2>
            <p
              className={`text-xs font-courier mt-1 max-w-md mx-auto ${
                isDark ? "text-[#A89F91]" : "text-[#5A6275]"
              }`}
            >
              {!isTorn
                ? "Move the antique lens over the document, then scroll to tear it."
                : "Hover the antique loupe to inspect hidden premises. Click a shard to challenge it."}
            </p>
          </div>

          {/* Three.js Canvas Container */}
          <div
            ref={canvasMountRef}
            className="absolute inset-0 w-full h-full z-10"
          />

          {/* Accessible Hidden <button> Elements for Screen-reader & Keyboard users */}
          <div className="sr-only">
            {SHARDS_DATA.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedShard(s)}
              >
                Inspect {s.name} shard: {s.question}
              </button>
            ))}
          </div>

          {/* Interactive Shard Detail Modal: Explicit Theme Compliance */}
          {selectedShard && (
            <div
              className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 transition-all animate-in fade-in duration-200 ${
                isDark
                  ? "bg-[#0b0e14]/75 backdrop-blur-[4px]"
                  : "bg-[#1d1d1b]/25 backdrop-blur-[3px]"
              }`}
              onClick={() => setSelectedShard(null)}
            >
              <div
                className={`relative w-full max-w-lg p-6 sm:p-8 shadow-2xl font-courier space-y-4 animate-in zoom-in-95 duration-200 border-2 border-l-4 ${
                  isDark
                    ? "bg-[#221F1C] border-[#38332C] border-l-[#D4AA50] text-[#F0EAE1] shadow-black/40"
                    : "bg-[#EDE7D6] border-[#cfc7b2] border-l-[#7a4e10] text-[#1d1d1b] shadow-[#1d1d1b]/10"
                }`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  clipPath: "polygon(0% 0%, 99% 1%, 100% 99%, 1% 100%)",
                }}
              >
                {/* Header Row */}
                <div
                  className={`flex items-center justify-between pb-3 border-b ${
                    isDark ? "border-[#38332C]" : "border-[#cfc7b2]"
                  }`}
                >
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${
                      isDark ? "text-[#D4AA50]" : "text-[#7a4e10]"
                    }`}
                  >
                    {selectedShard.tag}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedShard(null)}
                    className={`text-xs font-bold px-2.5 py-1 border transition cursor-pointer ${
                      isDark
                        ? "border-[#38332C] bg-[#181614] text-[#F0EAE1] hover:bg-[#F0EAE1] hover:text-[#181614]"
                        : "border-[#cfc7b2] bg-[#E5DEC9] text-[#1d1d1b] hover:bg-[#1d1d1b] hover:text-[#F4F0E6]"
                    }`}
                    title="Press ESC to close"
                  >
                    Close (Esc)
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Shard Title */}
                  <h3
                    className={`font-newsreader text-2xl sm:text-3xl font-normal ${
                      isDark ? "text-[#F0EAE1]" : "text-[#161E33]"
                    }`}
                  >
                    {selectedShard.name}
                  </h3>

                  {/* Challenging Question Quote */}
                  <p
                    className={`text-base sm:text-lg font-normal italic font-newsreader leading-snug ${
                      isDark ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                    }`}
                  >
                    “{selectedShard.question}”
                  </p>

                  {/* Premises List */}
                  <div
                    className={`space-y-2 pt-2 border-t ${
                      isDark ? "border-[#38332C]" : "border-[#D9D2C3]"
                    }`}
                  >
                    <span
                      className={`text-[11px] font-bold uppercase block tracking-wider ${
                        isDark ? "text-[#D4AA50]" : "text-[#b08a3c]"
                      }`}
                    >
                      SCRUTINIZED PREMISES:
                    </span>
                    <ul
                      className={`text-xs space-y-2 list-disc pl-4 ${
                        isDark ? "text-[#F0EAE1]" : "text-[#161E33]"
                      }`}
                    >
                      {selectedShard.bullets.map((b, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Action CTA Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onChallengeClick}
                      className={`w-full py-3 px-4 text-xs font-bold uppercase tracking-wider transition shadow-sm cursor-pointer border ${
                        isDark
                          ? "bg-[#F0EAE1] text-[#181614] hover:bg-white border-[#F0EAE1]"
                          : "bg-[#161E33] text-[#F5F1E8] hover:bg-[#232C47] border-[#161E33]"
                      }`}
                    >
                      Challenge this in DecisionLens →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Interactive HUD */}
          <div
            className={`relative z-20 pb-8 px-6 sm:px-12 flex items-center justify-between text-xs font-courier ${
              isDark ? "text-[#A89F91]" : "text-[#5A6275]"
            }`}
          >
            <div>
              <span>Scroll Progress: {Math.round(scrollProgress * 100)}%</span>
            </div>

            <div className="flex items-center gap-3">
              {!isTorn && (
                <button
                  type="button"
                  onClick={scrollToTearPoint}
                  className={`px-3 py-1.5 border font-bold tracking-wider uppercase text-xs transition cursor-pointer ${
                    isDark
                      ? "bg-[#221F1C] border-[#38332C] text-[#F0EAE1] hover:bg-[#F0EAE1] hover:text-[#181614]"
                      : "bg-[#EFEADF] border-[#161E33] text-[#161E33] hover:bg-[#161E33] hover:text-[#F5F1E8]"
                  }`}
                >
                  Challenge It ↓
                </button>
              )}
              {selectedShard && (
                <button
                  type="button"
                  onClick={() => setSelectedShard(null)}
                  className="underline cursor-pointer"
                >
                  Back to Overview
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Mobile / Fallback Mode (<760px, prefers-reduced-motion, or no WebGL) */
        <div className="px-4 sm:px-8 max-w-4xl mx-auto space-y-8 font-courier">
          <div className="text-center space-y-2">
            <span
              className={`text-xs font-courier tracking-[0.2em] uppercase font-bold block ${
                isDark ? "text-[#D4AA50]" : "text-[#2F5D8F]"
              }`}
            >
              DECONSTRUCTION
            </span>
            <h2
              className={`font-newsreader text-3xl sm:text-4xl font-normal ${
                isDark ? "text-[#F0EAE1]" : "text-[#161E33]"
              }`}
            >
              Six fault lines. Pick a shard.
            </h2>
            <p
              className={`text-xs sm:text-sm max-w-md mx-auto ${
                isDark ? "text-[#A89F91]" : "text-[#5A6275]"
              }`}
            >
              Every final decision conceals six critical fault lines. Tap any torn paper shard below to inspect its hidden premise.
            </p>
          </div>

          {/* 6 Responsive Torn Paper Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
            {SHARDS_DATA.map((s, idx) => (
              <div
                key={s.id}
                onClick={() => setSelectedShard(s)}
                className={`p-5 border-2 cursor-pointer transition-all hover:-translate-y-1 ${
                  isDark
                    ? idx % 2 === 0
                      ? "bg-[#221F1C] border-[#38332C] text-[#F0EAE1]"
                      : "bg-[#181614] border-[#38332C] text-[#F0EAE1]"
                    : idx % 2 === 0
                    ? "bg-[#EFEADF] border-[#161E33] text-[#161E33]"
                    : "bg-[#F5F1E8] border-[#161E33] text-[#161E33]"
                }`}
                style={{
                  clipPath:
                    idx % 2 === 0
                      ? "polygon(0% 0%, 98% 2%, 100% 97%, 2% 100%)"
                      : "polygon(2% 0%, 100% 3%, 97% 100%, 0% 97%)",
                }}
              >
                <div
                  className={`flex items-center justify-between pb-2 border-b ${
                    isDark ? "border-current/20" : "border-[#161E33]/20"
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold ${
                      isDark ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                    }`}
                  >
                    {s.tag}
                  </span>
                  <span
                    className={`text-[10px] uppercase ${
                      isDark ? "text-[#A89F91]" : "text-[#5A6275]"
                    }`}
                  >
                    FAULT #{idx + 1}
                  </span>
                </div>

                <div className="pt-2 space-y-1">
                  <h3 className="font-newsreader text-xl font-normal">
                    {s.name}
                  </h3>
                  <p
                    className={`text-xs italic ${
                      isDark ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                    }`}
                  >
                    “{s.question}”
                  </p>
                  <p
                    className={`text-[11px] pt-1 line-clamp-2 ${
                      isDark ? "text-[#A89F91]" : "text-[#5A6275]"
                    }`}
                  >
                    {s.bullets[0]}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Shard Detail Modal */}
          {selectedShard && (
            <div
              className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs ${
                isDark ? "bg-[#181614]/80" : "bg-[#161E33]/35"
              }`}
              onClick={() => setSelectedShard(null)}
            >
              <div
                className={`w-full max-w-lg border-2 border-l-4 p-6 shadow-2xl space-y-4 ${
                  isDark
                    ? "bg-[#221F1C] border-[#38332C] border-l-[#D4AA50] text-[#F0EAE1]"
                    : "bg-[#EDE7D6] border-[#cfc7b2] border-l-[#7a4e10] text-[#1d1d1b]"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className={`flex items-center justify-between pb-3 border-b ${
                    isDark ? "border-[#38332C]" : "border-[#D9D2C3]"
                  }`}
                >
                  <span
                    className={`text-xs font-bold uppercase ${
                      isDark ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                    }`}
                  >
                    {selectedShard.tag}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedShard(null)}
                    className={`text-xs font-bold px-2 py-0.5 border ${
                      isDark
                        ? "border-[#38332C] bg-[#181614] text-[#F0EAE1]"
                        : "border-[#D9D2C3] bg-[#EFEADF] text-[#161E33]"
                    }`}
                  >
                    CLOSE [×]
                  </button>
                </div>

                <h3 className="font-newsreader text-2xl">
                  {selectedShard.name}
                </h3>
                <p
                  className={`text-xs font-bold italic ${
                    isDark ? "text-[#D4AA50]" : "text-[#2F5D8F]"
                  }`}
                >
                  “{selectedShard.question}”
                </p>

                <ul className="text-xs space-y-2 list-disc pl-4">
                  {selectedShard.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={onChallengeClick}
                  className={`w-full py-3 text-xs font-bold uppercase tracking-wider ${
                    isDark
                      ? "bg-[#F0EAE1] text-[#181614]"
                      : "bg-[#161E33] text-[#F5F1E8]"
                  }`}
                >
                  Challenge this in DecisionLens →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
