"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Decision } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";

interface Portfolio3DCanvasProps {
  decisions: Decision[];
  selectedDecisionId?: number | null;
  onSelectDecision?: (decision: Decision) => void;
  className?: string;
}

interface NodeUserData {
  decision: Decision;
  baseY: number;
  hoverScale: number;
}

export default function Portfolio3DCanvas({
  decisions,
  selectedDecisionId,
  onSelectDecision,
  className = "",
}: Portfolio3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { theme } = useTheme();

  const [hoveredDecision, setHoveredDecision] = useState<Decision | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  // References for Three.js state
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    nodesGroup: THREE.Group | null;
    gridGroup: THREE.Group | null;
    linesGroup: THREE.Group | null;
    animationFrameId: number;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    spherical: { radius: number; theta: number; phi: number };
    targetSpherical: { radius: number; theta: number; phi: number };
    isDragging: boolean;
    previousPointer: { x: number; y: number };
    meshMap: Map<number, THREE.Mesh>;
  }>({
    renderer: null,
    scene: null,
    camera: null,
    nodesGroup: null,
    gridGroup: null,
    linesGroup: null,
    animationFrameId: 0,
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(-1000, -1000),
    spherical: { radius: 14, theta: Math.PI / 4, phi: Math.PI / 3.2 },
    targetSpherical: { radius: 14, theta: Math.PI / 4, phi: Math.PI / 3.2 },
    isDragging: false,
    previousPointer: { x: 0, y: 0 },
    meshMap: new Map(),
  });

  // Main Three.js Scene Setup
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    // 1. Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // 2. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);

    // Initial camera position from spherical
    const s = stateRef.current.spherical;
    camera.position.x = s.radius * Math.sin(s.phi) * Math.sin(s.theta);
    camera.position.y = s.radius * Math.cos(s.phi);
    camera.position.z = s.radius * Math.sin(s.phi) * Math.cos(s.theta);
    camera.lookAt(0, 1.2, 0);

    // 3. Lighting
    const isDark = theme === "dark";
    const ambientLight = new THREE.AmbientLight(isDark ? 0x242226 : 0xfcfbf8, isDark ? 1.6 : 1.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(isDark ? 0xd4aa50 : 0x2f5d8f, 2.2);
    dirLight1.position.set(10, 15, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(isDark ? 0x38bdf8 : 0xd97706, 1.4);
    dirLight2.position.set(-10, -5, -8);
    scene.add(dirLight2);

    // 4. Groups
    const gridGroup = new THREE.Group();
    const linesGroup = new THREE.Group();
    const nodesGroup = new THREE.Group();

    scene.add(gridGroup);
    scene.add(linesGroup);
    scene.add(nodesGroup);

    stateRef.current.renderer = renderer;
    stateRef.current.scene = scene;
    stateRef.current.camera = camera;
    stateRef.current.gridGroup = gridGroup;
    stateRef.current.linesGroup = linesGroup;
    stateRef.current.nodesGroup = nodesGroup;

    // 5. Build Topographical Grid Floor
    const gridColor = isDark ? 0x332e2a : 0xd9d2c3;
    const centerColor = isDark ? 0xd4aa50 : 0x2f5d8f;

    const gridHelper = new THREE.GridHelper(16, 16, centerColor, gridColor);
    gridHelper.position.y = 0;
    gridGroup.add(gridHelper);

    // Concentric Radar Rings
    [3, 6, 8].forEach((r) => {
      const ringGeom = new THREE.RingGeometry(r - 0.02, r + 0.02, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: gridColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isDark ? 0.3 : 0.45,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      gridGroup.add(ringMesh);
    });

    // Handle Resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const nw = container.clientWidth || 800;
      const nh = container.clientHeight || 520;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
    };

    window.addEventListener("resize", handleResize);

    // 6. Animation Loop
    let clock = 0;
    const animate = () => {
      clock += 0.015;

      const state = stateRef.current;
      // Damping spherical camera
      const cur = state.spherical;
      const tgt = state.targetSpherical;

      cur.radius += (tgt.radius - cur.radius) * 0.08;
      cur.theta += (tgt.theta - cur.theta) * 0.08;
      cur.phi += (tgt.phi - cur.phi) * 0.08;

      camera.position.x = cur.radius * Math.sin(cur.phi) * Math.sin(cur.theta);
      camera.position.y = cur.radius * Math.cos(cur.phi);
      camera.position.z = cur.radius * Math.sin(cur.phi) * Math.cos(cur.theta);
      camera.lookAt(0, 1.2, 0);

      // Node levitation & halo pulses
      if (state.nodesGroup) {
        state.nodesGroup.children.forEach((child, idx) => {
          if (child instanceof THREE.Mesh) {
            const uData = child.userData as NodeUserData;
            const baseY = uData?.baseY ?? 1;
            child.position.y = baseY + Math.sin(clock * 2 + idx * 0.7) * 0.08;

            // Halo ring spin
            if (child.children.length > 0) {
              const halo = child.children[0];
              halo.rotation.z += 0.02;
              halo.rotation.x = Math.PI / 2 + Math.sin(clock + idx) * 0.1;
            }
          }
        });
      }

      renderer.render(scene, camera);
      state.animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(stateRef.current.animationFrameId);
      renderer.dispose();
    };
  }, [theme]);

  // Build Nodes & Constellation Lines
  useEffect(() => {
    const state = stateRef.current;
    if (!state.nodesGroup || !state.linesGroup) return;

    // Clear previous
    while (state.nodesGroup.children.length > 0) {
      const child = state.nodesGroup.children[0];
      state.nodesGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
    while (state.linesGroup.children.length > 0) {
      const child = state.linesGroup.children[0];
      state.linesGroup.remove(child);
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        child.material.dispose();
      }
    }
    state.meshMap.clear();

    const isDark = theme === "dark";
    const total = decisions.length;
    if (total === 0) return;

    // Compute coordinates for each decision
    const positions: THREE.Vector3[] = [];

    decisions.forEach((dec, idx) => {
      // Deterministic layout based on index and hash
      const hash = ((dec.id * 17 + idx * 31) % 100) / 100;
      const angle = (idx / total) * Math.PI * 2 + hash * 0.4;
      const radius = 2.5 + (hash * 4.2);

      // Coordinates
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Altitude based on decision maturity
      let y = 1.0;
      if (dec.status === "decided") {
        y = 2.4 + (hash * 0.6); // Soaring apex for decided consensus
      } else if (dec.status === "evaluating") {
        y = 1.7 + (hash * 0.4); // Mid altitude
      } else {
        y = 0.8 + (hash * 0.3); // Draft near ground
      }

      const pos = new THREE.Vector3(x, y, z);
      positions.push(pos);

      // Geometry & Material
      const isSelected = selectedDecisionId === dec.id;
      let nodeGeom: THREE.BufferGeometry;
      let nodeMat: THREE.Material;

      if (dec.status === "decided") {
        // Faceted Octahedron / Jewel for Decided Consensus
        nodeGeom = new THREE.OctahedronGeometry(isSelected ? 0.45 : 0.36, 0);
        nodeMat = new THREE.MeshStandardMaterial({
          color: isDark ? 0xd4aa50 : 0x166534,
          roughness: 0.25,
          metalness: 0.7,
          emissive: isDark ? 0xb45309 : 0x14532d,
          emissiveIntensity: isSelected ? 0.8 : 0.25,
        });
      } else if (dec.status === "evaluating") {
        // Icosahedron for Active Gauntlet Scrutiny
        nodeGeom = new THREE.IcosahedronGeometry(isSelected ? 0.42 : 0.34, 0);
        nodeMat = new THREE.MeshStandardMaterial({
          color: isDark ? 0x38bdf8 : 0x2563eb,
          roughness: 0.3,
          metalness: 0.6,
          emissive: isDark ? 0x0284c7 : 0x1d4ed8,
          emissiveIntensity: isSelected ? 0.8 : 0.2,
        });
      } else {
        // Smooth Sphere for Draft
        nodeGeom = new THREE.SphereGeometry(isSelected ? 0.36 : 0.28, 16, 16);
        nodeMat = new THREE.MeshStandardMaterial({
          color: isDark ? 0xa8a29e : 0x78716c,
          roughness: 0.5,
          metalness: 0.2,
        });
      }

      const mesh = new THREE.Mesh(nodeGeom, nodeMat);
      mesh.position.copy(pos);
      mesh.userData = {
        decision: dec,
        baseY: y,
        hoverScale: 1.0,
      } as NodeUserData;

      // Halo ring for Decided & Evaluating decisions
      if (dec.status === "decided" || dec.status === "evaluating") {
        const ringGeom = new THREE.TorusGeometry(0.52, 0.02, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: dec.status === "decided" ? (isDark ? 0xfef08a : 0x86efac) : (isDark ? 0xbae6fd : 0x93c5fd),
          transparent: true,
          opacity: 0.7,
        });
        const halo = new THREE.Mesh(ringGeom, ringMat);
        halo.rotation.x = Math.PI / 2;
        mesh.add(halo);
      }

      // Vertical tether to ground
      const lineMat = new THREE.LineBasicMaterial({
        color: isDark ? 0x44403c : 0xd6d3d1,
        transparent: true,
        opacity: 0.35,
      });
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, z),
        new THREE.Vector3(x, y, z),
      ]);
      const tether = new THREE.Line(lineGeom, lineMat);
      state.linesGroup?.add(tether);

      state.nodesGroup?.add(mesh);
      state.meshMap.set(dec.id, mesh);
    });

    // Draw Constellation Trade-Off Lines between proximate decisions
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const p1 = positions[i];
        const p2 = positions[j];
        const dist = p1.distanceTo(p2);

        // Connect if in proximity
        if (dist < 4.2) {
          const curve = new THREE.QuadraticBezierCurve3(
            p1,
            new THREE.Vector3((p1.x + p2.x) / 2, Math.max(p1.y, p2.y) + 0.5, (p1.z + p2.z) / 2),
            p2
          );
          const pts = curve.getPoints(20);
          const geom = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineBasicMaterial({
            color: isDark ? 0xd4aa50 : 0x2f5d8f,
            transparent: true,
            opacity: Math.max(0.1, 0.35 - dist * 0.06),
          });
          const cLine = new THREE.Line(geom, mat);
          state.linesGroup.add(cLine);
        }
      }
    }
  }, [decisions, selectedDecisionId, theme]);

  // Pointer Interaction: Dragging, Zooming, Raycasting
  const handlePointerDown = (e: React.PointerEvent) => {
    stateRef.current.isDragging = true;
    stateRef.current.previousPointer = { x: e.clientX, y: e.clientY };
    setIsInteracting(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const state = stateRef.current;
    if (state.isDragging) {
      const deltaX = e.clientX - state.previousPointer.x;
      const deltaY = e.clientY - state.previousPointer.y;

      state.targetSpherical.theta -= deltaX * 0.007;
      state.targetSpherical.phi = Math.max(
        0.15,
        Math.min(Math.PI / 2.05, state.targetSpherical.phi - deltaY * 0.007)
      );

      state.previousPointer = { x: e.clientX, y: e.clientY };
    }

    // Raycast hover detection
    const rect = container.getBoundingClientRect();
    state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    if (state.camera && state.nodesGroup) {
      state.raycaster.setFromCamera(state.mouse, state.camera);
      const intersects = state.raycaster.intersectObjects(state.nodesGroup.children, false);

      if (intersects.length > 0) {
        const topHit = intersects[0].object as THREE.Mesh;
        const uData = topHit.userData as NodeUserData;
        if (uData?.decision) {
          setHoveredDecision(uData.decision);
          setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          container.style.cursor = "pointer";
          return;
        }
      }
    }

    setHoveredDecision(null);
    setTooltipPos(null);
    container.style.cursor = state.isDragging ? "grabbing" : "grab";
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const state = stateRef.current;
    const wasDragging = state.isDragging;
    state.isDragging = false;
    setIsInteracting(false);

    // If it was a quick click, trigger selection
    if (state.camera && state.nodesGroup) {
      state.raycaster.setFromCamera(state.mouse, state.camera);
      const intersects = state.raycaster.intersectObjects(state.nodesGroup.children, false);
      if (intersects.length > 0) {
        const topHit = intersects[0].object as THREE.Mesh;
        const uData = topHit.userData as NodeUserData;
        if (uData?.decision && onSelectDecision) {
          onSelectDecision(uData.decision);
        }
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const state = stateRef.current;
    state.targetSpherical.radius = Math.max(
      6,
      Math.min(24, state.targetSpherical.radius + e.deltaY * 0.015)
    );
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        stateRef.current.isDragging = false;
        setIsInteracting(false);
        setHoveredDecision(null);
        setTooltipPos(null);
      }}
      onWheel={handleWheel}
      className={`relative select-none overflow-hidden cursor-grab active:cursor-grabbing rounded-2xl ${className}`}
      title="Drag to orbit 3D Constellation • Scroll to zoom"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Floating 3D Navigation Controls Pill */}
      <div className="absolute bottom-3 left-3 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-surface)]/80 backdrop-blur-xs border border-[var(--border)] text-[11px] text-[var(--ink-secondary)] shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />
        <span className="font-mono uppercase tracking-wider text-[10px]">
          {isInteracting ? "Orbiting Space" : "Drag to Orbit • Scroll to Zoom"}
        </span>
      </div>

      {/* Legend Indicator */}
      <div className="absolute top-3 right-3 pointer-events-none flex items-center gap-3 px-3 py-1.5 rounded-xl bg-[var(--bg-surface)]/80 backdrop-blur-xs border border-[var(--border)] text-[11px] text-[var(--ink-secondary)] shadow-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs" />
          <span>Decided</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-xs" />
          <span>Scrutiny</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs" />
          <span>Draft</span>
        </span>
      </div>

      {/* Interactive Raycast Tooltip */}
      {hoveredDecision && tooltipPos && (
        <div
          className="absolute z-30 pointer-events-none max-w-xs p-3 rounded-xl bg-[var(--bg-surface)] text-[var(--ink)] border border-[var(--border)] shadow-xl animate-fadeIn transform -translate-x-1/2 -translate-y-full mb-3"
          style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y - 12}px` }}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-secondary)]">
              {hoveredDecision.domain || "STRATEGY"} &bull; #{hoveredDecision.id}
            </span>
            <span
              className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                hoveredDecision.status === "decided"
                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                  : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
              }`}
            >
              {hoveredDecision.status}
            </span>
          </div>

          <h4 className="text-xs font-serif font-bold text-[var(--ink)] leading-snug line-clamp-2">
            {hoveredDecision.title}
          </h4>

          {hoveredDecision.problem_statement && (
            <p className="text-[11px] text-[var(--ink-secondary)] line-clamp-2 mt-1">
              {hoveredDecision.problem_statement}
            </p>
          )}

          <div className="pt-2 mt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--accent)] font-bold">
            <span>Click to inspect &rarr;</span>
          </div>
        </div>
      )}
    </div>
  );
}

