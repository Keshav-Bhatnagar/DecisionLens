"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useTheme } from "@/context/ThemeContext";

export type DecisionSignature = "first_principles" | "velocity" | "risk_architect" | "contrarian";

interface DecisionPrismCanvasProps {
  signature: DecisionSignature;
  className?: string;
  onSelectSignature?: (sig: DecisionSignature) => void;
}

export default function DecisionPrismCanvas({
  signature,
  className = "",
  onSelectSignature,
}: DecisionPrismCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { theme } = useTheme();

  const [isHovered, setIsHovered] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  // References for Three.js state
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    group: THREE.Group | null;
    currentMeshGroup: THREE.Group | null;
    animationFrameId: number;
    targetRotationX: number;
    targetRotationY: number;
    currentRotationX: number;
    currentRotationY: number;
    isDragging: boolean;
    previousMousePosition: { x: number; y: number };
  }>({
    renderer: null,
    scene: null,
    camera: null,
    group: null,
    currentMeshGroup: null,
    animationFrameId: 0,
    targetRotationX: 0,
    targetRotationY: 0,
    currentRotationX: 0,
    currentRotationY: 0,
    isDragging: false,
    previousMousePosition: { x: 0, y: 0 },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 280;

    // 1. Setup Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // 2. Setup Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.z = 4.8;

    // 3. Lighting
    const isDark = theme === "dark";
    const ambientLight = new THREE.AmbientLight(isDark ? 0x222233 : 0xfffaf0, isDark ? 1.4 : 1.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(isDark ? 0x60a5fa : 0xd97706, 1.8);
    dirLight1.position.set(4, 5, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(isDark ? 0xa855f7 : 0x2b4c8c, 1.4);
    dirLight2.position.set(-4, -3, 3);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(isDark ? 0x38bdf8 : 0xf59e0b, 1.2, 10);
    pointLight.position.set(0, 0, 3);
    scene.add(pointLight);

    // 4. Root interactive group
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    stateRef.current.renderer = renderer;
    stateRef.current.scene = scene;
    stateRef.current.camera = camera;
    stateRef.current.group = rootGroup;

    // Handle Resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newWidth = container.clientWidth || 320;
      const newHeight = container.clientHeight || 280;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight, false);
    };

    window.addEventListener("resize", handleResize);

    // 5. Animation Loop
    let time = 0;
    const animate = () => {
      time += 0.015;

      const state = stateRef.current;
      if (state.group) {
        // Smooth rotation damping
        state.currentRotationX += (state.targetRotationX - state.currentRotationX) * 0.08;
        state.currentRotationY += (state.targetRotationY - state.currentRotationY) * 0.08;

        state.group.rotation.x = state.currentRotationX + Math.sin(time * 0.8) * 0.05;
        state.group.rotation.y = state.currentRotationY + time * 0.4;
        state.group.position.y = Math.sin(time * 1.5) * 0.08;
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

  // Re-build 3D Creation when signature or theme changes
  useEffect(() => {
    const state = stateRef.current;
    if (!state.group) return;

    // Clear previous children
    while (state.group.children.length > 0) {
      const child = state.group.children[0];
      state.group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    const isDark = theme === "dark";
    const meshGroup = new THREE.Group();

    if (signature === "first_principles") {
      // 1. First-Principles: Precision Octahedron / Crystalline Core with Floating Wireframe & Rings
      const geom = new THREE.OctahedronGeometry(1.2, 0);
      const mat = new THREE.MeshPhysicalMaterial({
        color: isDark ? 0xf59e0b : 0xd97706,
        roughness: 0.15,
        metalness: 0.2,
        transmission: 0.45,
        thickness: 1.2,
        reflectivity: 0.9,
        wireframe: false,
      });
      const core = new THREE.Mesh(geom, mat);
      meshGroup.add(core);

      // Delicate wireframe cage
      const wireframeGeom = new THREE.OctahedronGeometry(1.35, 1);
      const wireframeMat = new THREE.MeshBasicMaterial({
        color: isDark ? 0xfbbf24 : 0x161e33,
        wireframe: true,
        transparent: true,
        opacity: isDark ? 0.35 : 0.25,
      });
      meshGroup.add(new THREE.Mesh(wireframeGeom, wireframeMat));

      // Orbital alignment ring
      const ringGeom = new THREE.TorusGeometry(1.7, 0.02, 16, 64);
      const ringMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x60a5fa : 0x2b4c8c,
        metalness: 0.8,
        roughness: 0.2,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = Math.PI / 3;
      meshGroup.add(ring);
    } else if (signature === "velocity") {
      // 2. Velocity & Momentum: Multi-Ring Gyroscope with High-Speed Core
      const coreGeom = new THREE.SphereGeometry(0.55, 32, 32);
      const coreMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x38bdf8 : 0x0284c7,
        metalness: 0.9,
        roughness: 0.1,
      });
      meshGroup.add(new THREE.Mesh(coreGeom, coreMat));

      // Outer Ring 1
      const ring1Geom = new THREE.TorusGeometry(1.4, 0.045, 16, 80);
      const ring1Mat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x60a5fa : 0x1e3a8a,
        metalness: 0.7,
        roughness: 0.3,
      });
      const r1 = new THREE.Mesh(ring1Geom, ring1Mat);
      r1.rotation.y = Math.PI / 4;
      meshGroup.add(r1);

      // Outer Ring 2
      const ring2Geom = new THREE.TorusGeometry(1.15, 0.04, 16, 80);
      const ring2Mat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x34d399 : 0x059669,
        metalness: 0.6,
        roughness: 0.3,
      });
      const r2 = new THREE.Mesh(ring2Geom, ring2Mat);
      r2.rotation.x = Math.PI / 3;
      meshGroup.add(r2);

      // Trailing kinetic ring
      const ring3Geom = new THREE.TorusGeometry(1.65, 0.02, 16, 80);
      const ring3Mat = new THREE.MeshBasicMaterial({
        color: isDark ? 0x93c5fd : 0x64748b,
        transparent: true,
        opacity: 0.5,
      });
      meshGroup.add(new THREE.Mesh(ring3Geom, ring3Mat));
    } else if (signature === "risk_architect") {
      // 3. Risk Architect: Interlocking Polyhedral Geodesic Shield Vault
      const icosaGeom = new THREE.IcosahedronGeometry(1.2, 0);
      const icosaMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x10b981 : 0x047857,
        metalness: 0.4,
        roughness: 0.25,
        flatShading: true,
      });
      const vault = new THREE.Mesh(icosaGeom, icosaMat);

      // Accent edges for structural integrity look
      const edges = new THREE.EdgesGeometry(icosaGeom);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: isDark ? 0x6ee7b7 : 0x064e3b,
          linewidth: 2,
        })
      );
      vault.add(line);
      meshGroup.add(vault);

      // Concentric defensive shields
      const shieldRingGeom = new THREE.TorusGeometry(1.6, 0.035, 8, 48);
      const shieldRingMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0xa7f3d0 : 0x065f46,
        metalness: 0.8,
      });
      const sRing = new THREE.Mesh(shieldRingGeom, shieldRingMat);
      sRing.rotation.x = Math.PI / 2;
      meshGroup.add(sRing);
    } else {
      // 4. Long-Term Contrarian: Nested Torus Knot / Astrolabe with Orbital Beacons
      const knotGeom = new THREE.TorusKnotGeometry(0.85, 0.26, 100, 16, 2, 3);
      const knotMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0x8b5cf6 : 0x6d28d9,
        metalness: 0.6,
        roughness: 0.2,
      });
      const knot = new THREE.Mesh(knotGeom, knotMat);
      meshGroup.add(knot);

      // Floating non-consensus beacon
      const beaconGeom = new THREE.SphereGeometry(0.18, 16, 16);
      const beaconMat = new THREE.MeshStandardMaterial({
        color: isDark ? 0xf43f5e : 0xe11d48,
        emissive: isDark ? 0xe11d48 : 0xbe123c,
        emissiveIntensity: 0.5,
      });
      const beacon = new THREE.Mesh(beaconGeom, beaconMat);
      beacon.position.set(1.5, 0.7, 0.4);
      meshGroup.add(beacon);

      const beacon2 = new THREE.Mesh(beaconGeom, beaconMat);
      beacon2.position.set(-1.4, -0.6, -0.4);
      meshGroup.add(beacon2);
    }

    state.group.add(meshGroup);
    state.currentMeshGroup = meshGroup;
  }, [signature, theme]);

  // Mouse Interaction: Drag to rotate, mouse move to tilt
  const handleMouseDown = (e: React.MouseEvent) => {
    stateRef.current.isDragging = true;
    stateRef.current.previousMousePosition = { x: e.clientX, y: e.clientY };
    setIsInteracting(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const state = stateRef.current;
    if (state.isDragging) {
      const deltaX = e.clientX - state.previousMousePosition.x;
      const deltaY = e.clientY - state.previousMousePosition.y;

      state.targetRotationY += deltaX * 0.01;
      state.targetRotationX += deltaY * 0.01;

      state.previousMousePosition = { x: e.clientX, y: e.clientY };
    } else if (containerRef.current) {
      // Parallax hover tilt
      const rect = containerRef.current.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      state.targetRotationY = nx * 0.6;
      state.targetRotationX = ny * 0.4;
    }
  };

  const handleMouseUp = () => {
    stateRef.current.isDragging = false;
    setIsInteracting(false);
  };

  const handleMouseLeave = () => {
    stateRef.current.isDragging = false;
    stateRef.current.targetRotationX = 0;
    stateRef.current.targetRotationY = 0;
    setIsHovered(false);
    setIsInteracting(false);
  };

  // Touch Support for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      stateRef.current.isDragging = true;
      stateRef.current.previousMousePosition = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      setIsInteracting(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const state = stateRef.current;
    if (state.isDragging && e.touches.length === 1) {
      const deltaX = e.touches[0].clientX - state.previousMousePosition.x;
      const deltaY = e.touches[0].clientY - state.previousMousePosition.y;

      state.targetRotationY += deltaX * 0.012;
      state.targetRotationX += deltaY * 0.012;

      state.previousMousePosition = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchEnd = () => {
    stateRef.current.isDragging = false;
    setIsInteracting(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative select-none cursor-grab active:cursor-grabbing flex items-center justify-center overflow-hidden rounded-2xl ${className}`}
      title="Click and drag to rotate the Decision Artifact in 3D"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Floating 3D Interaction Badge */}
      <div className="absolute bottom-2.5 right-3 pointer-events-none flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--bg-surface)]/70 backdrop-blur-xs border border-[var(--border)] text-[10px] text-[var(--ink-secondary)] transition-opacity duration-200">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-ping" />
        <span className="font-mono uppercase tracking-wider">
          {isInteracting ? "Rotating 3D" : "Interactive 3D"}
        </span>
      </div>
    </div>
  );
}
