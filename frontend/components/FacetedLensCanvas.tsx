"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

interface FacetedLensCanvasProps {
  size?: number;
  className?: string;
}

export default function FacetedLensCanvas({
  size = 46,
  className = "",
}: FacetedLensCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationFrameId: number;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.z = 6.6;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
    dirLight.position.set(2, 3, 4);
    scene.add(dirLight);

    const group = new THREE.Group();
    group.position.set(-0.3, 0.3, 0);
    scene.add(group);

    const JR = [1, 1.07, 0.95, 1.05, 0.97, 1.04];
    const JA = [0.04, -0.05, 0.03, -0.04, 0.05, -0.03];
    const CL = [0xe9e0c8, 0xd9cdae, 0xf2ebd8, 0xcbbf9f, 0x2b4c8c, 0xe3d9be];
    const V: [number, number][] = [];
    const shardParts: Array<{
      mesh: THREE.Mesh;
      cx: number;
      cy: number;
      dx: number;
      dy: number;
      z: number;
      r: number;
    }> = [];

    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 + JA[k] + Math.PI / 6;
      V.push([Math.cos(a) * JR[k], Math.sin(a) * JR[k]]);
    }

    for (let k = 0; k < 6; k++) {
      const p1 = V[k];
      const p2 = V[(k + 1) % 6];
      const cx = (p1[0] + p2[0]) / 3;
      const cy = (p1[1] + p2[1]) / 3;
      const L = Math.hypot(cx, cy);

      const shape = new THREE.Shape([
        new THREE.Vector2(-cx, -cy),
        new THREE.Vector2(p1[0] - cx, p1[1] - cy),
        new THREE.Vector2(p2[0] - cx, p2[1] - cy),
      ]);

      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.14,
        bevelEnabled: false,
      });
      geom.translate(0, 0, -0.07);

      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({
          color: CL[k],
          flatShading: true,
          roughness: 0.85,
        })
      );

      const edgeGeom = new THREE.EdgesGeometry(geom);
      mesh.add(
        new THREE.LineSegments(
          edgeGeom,
          new THREE.LineBasicMaterial({ color: 0x1e2a44 })
        )
      );

      group.add(mesh);
      shardParts.push({
        mesh,
        cx,
        cy,
        dx: cx / L,
        dy: cy / L,
        z: (Math.random() - 0.4) * 1.4,
        r: (Math.random() - 0.5) * 2,
      });
    }

    // Brass Bezel Ring
    const torusGeom = new THREE.TorusGeometry(1.25, 0.075, 16, 64);
    const torusMat = new THREE.MeshStandardMaterial({
      color: 0xb08a3c,
      metalness: 0.7,
      roughness: 0.32,
    });
    group.add(new THREE.Mesh(torusGeom, torusMat));

    // Handle
    const handleGeom = new THREE.CylinderGeometry(0.08, 0.11, 1.15, 16);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x2a1e0e,
      roughness: 0.6,
    });
    const handleMesh = new THREE.Mesh(handleGeom, handleMat);
    handleMesh.position.set(1.28, -1.28, 0);
    handleMesh.rotation.z = Math.PI / 4;
    group.add(handleMesh);

    let cur = prefersReducedMotion ? 0 : 3;
    let hovered = false;
    let targetRotation = 0;
    let currentRotation = 0;

    const onPointerEnter = () => {
      hovered = true;
      targetRotation = Math.PI; // 180° rotation on hover!
    };
    const onPointerLeave = () => {
      hovered = false;
      targetRotation = 0; // returns to baseline
    };

    canvas.addEventListener("pointerenter", onPointerEnter);
    canvas.addEventListener("pointerleave", onPointerLeave);

    // Also listen to parent element hover if mounted in a button or link
    const parent = canvas.parentElement;
    parent?.addEventListener("pointerenter", onPointerEnter);
    parent?.addEventListener("pointerleave", onPointerLeave);

    let startTime = performance.now();

    const animate = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsed = (currentTime - startTime) / 1000;
      cur += ((hovered ? 0.7 : 0) - cur) * (cur > 1.5 ? 0.04 : 0.08);

      shardParts.forEach((p) => {
        const ff = 0.02 + 0.6 * cur;
        p.mesh.position.set(p.cx + p.dx * ff, p.cy + p.dy * ff, p.z * cur);
        p.mesh.rotation.set(p.r * cur * 0.5, p.r * cur * 0.4, p.r * cur * 0.6);
      });

      if (!prefersReducedMotion) {
        // Smoothly interpolate rotation to target (180° on hover)
        currentRotation += (targetRotation - currentRotation) * 0.08;
        // Add subtle idle wobble when not hovered
        const wobble = hovered ? 0 : Math.sin(elapsed * 0.8) * 0.25;
        group.rotation.y = currentRotation + wobble;
      }

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener("pointerenter", onPointerEnter);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      parent?.removeEventListener("pointerenter", onPointerEnter);
      parent?.removeEventListener("pointerleave", onPointerLeave);
      renderer.dispose();
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="DecisionLens faceted lens mark"
      className={`block shrink-0 transition-transform duration-700 ease-in-out group-hover:rotate-180 motion-reduce:transform-none ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
}

