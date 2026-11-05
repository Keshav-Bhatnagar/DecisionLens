"use client";

import React, { useEffect, useRef } from "react";

export default function AmbientWaveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;
    let mouseX = -1000;
    let mouseY = -1000;
    let targetMouseX = -1000;
    let targetMouseY = -1000;
    let time = 0;

    // Accessibility: check prefers-reduced-motion
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isReducedMotion = mediaQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      isReducedMotion = e.matches;
    };
    mediaQuery.addEventListener("change", handleMotionChange);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      targetMouseX = -1000;
      targetMouseY = -1000;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);
    resize();

    // High-craft curvature strata configuration:
    // Foundation ribbons have macro S-curve baselines with multi-harmonic amplitude swings
    // creating sweeping, organic topological flow across the viewport.
    const foundationRibbons = [
      {
        baseYRel: 0.68,
        macroAmp: 55,
        wave1Amp: 42,
        wave2Amp: 22,
        freq1: 1.4,
        freq2: 2.8,
        speed: 0.65,
        color: "bronze",
        width: 1.6,
        alpha: 0.42,
      },
      {
        baseYRel: 0.73,
        macroAmp: 60,
        wave1Amp: 46,
        wave2Amp: 24,
        freq1: 1.3,
        freq2: 2.6,
        speed: 0.58,
        color: "slate",
        width: 1.25,
        alpha: 0.30,
      },
      {
        baseYRel: 0.78,
        macroAmp: 65,
        wave1Amp: 50,
        wave2Amp: 26,
        freq1: 1.2,
        freq2: 2.4,
        speed: 0.72,
        color: "amber",
        width: 1.9,
        alpha: 0.48,
      },
      {
        baseYRel: 0.83,
        macroAmp: 70,
        wave1Amp: 54,
        wave2Amp: 28,
        freq1: 1.1,
        freq2: 2.2,
        speed: 0.52,
        color: "slate",
        width: 1.2,
        alpha: 0.28,
      },
      {
        baseYRel: 0.88,
        macroAmp: 75,
        wave1Amp: 58,
        wave2Amp: 30,
        freq1: 1.0,
        freq2: 2.0,
        speed: 0.62,
        color: "bronze",
        width: 1.6,
        alpha: 0.38,
      },
      {
        baseYRel: 0.93,
        macroAmp: 80,
        wave1Amp: 62,
        wave2Amp: 32,
        freq1: 0.9,
        freq2: 1.8,
        speed: 0.48,
        color: "amber",
        width: 1.8,
        alpha: 0.34,
      },
      {
        baseYRel: 0.98,
        macroAmp: 85,
        wave1Amp: 66,
        wave2Amp: 34,
        freq1: 0.85,
        freq2: 1.6,
        speed: 0.42,
        color: "slate",
        width: 1.1,
        alpha: 0.22,
      },
    ];

    const horizonRibbons = [
      {
        baseYRel: 0.04,
        macroAmp: 22,
        wave1Amp: 18,
        wave2Amp: 10,
        freq1: 1.1,
        freq2: 2.2,
        speed: 0.45,
        color: "slate",
        width: 1.1,
        alpha: 0.24,
      },
      {
        baseYRel: 0.08,
        macroAmp: 26,
        wave1Amp: 22,
        wave2Amp: 12,
        freq1: 0.95,
        freq2: 1.9,
        speed: 0.52,
        color: "bronze",
        width: 1.35,
        alpha: 0.32,
      },
      {
        baseYRel: 0.13,
        macroAmp: 30,
        wave1Amp: 25,
        wave2Amp: 14,
        freq1: 0.85,
        freq2: 1.7,
        speed: 0.60,
        color: "amber",
        width: 1.5,
        alpha: 0.36,
      },
    ];

    const allRibbons = [...horizonRibbons, ...foundationRibbons];
    const numPoints = 64;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const timeIncrement = isReducedMotion ? 0.0006 : 0.0032;
      time += timeIncrement;

      // Smooth mouse lerping with natural damping
      mouseX += (targetMouseX - mouseX) * 0.038;
      mouseY += (targetMouseY - mouseY) * 0.038;

      // 1. Soft Ambient Radial Light - blends the paper warmth with the hero zone
      const glowGrad = ctx.createRadialGradient(
        width * 0.28,
        height * 0.42,
        45,
        width * 0.28,
        height * 0.42,
        width * 0.55
      );
      glowGrad.addColorStop(0, "rgba(217, 119, 6, 0.06)");
      glowGrad.addColorStop(0.55, "rgba(245, 158, 11, 0.018)");
      glowGrad.addColorStop(1, "rgba(248, 245, 238, 0)");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Render Curvaceous Topological Strata
      allRibbons.forEach((ribbon) => {
        const points: { x: number; y: number }[] = [];
        const baseY = height * ribbon.baseYRel;
        const wavePhase = time * ribbon.speed;

        for (let j = 0; j <= numPoints; j++) {
          const frac = j / numPoints;
          const x = frac * width;

          // Macro S-Curve Baseline: sweeping crest and trough across the canvas
          // Gives the contour an expansive, dynamic trajectory rather than a flat line
          const macroArc = Math.sin(frac * Math.PI * 1.4 - 0.4) * ribbon.macroAmp;

          // Multi-harmonic natural wave synthesis
          const w1 = Math.sin(frac * Math.PI * ribbon.freq1 + wavePhase) * ribbon.wave1Amp;
          const w2 = Math.cos(frac * Math.PI * ribbon.freq2 - wavePhase * 0.8) * ribbon.wave2Amp;
          const w3 = Math.sin(frac * 6.0 + wavePhase * 1.2) * (ribbon.wave2Amp * 0.35);

          // Gravitational Lens Deflection (smooth organic warp around cursor)
          const dx = x - mouseX;
          const dy = baseY - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const lensRadius = 360;
          let lensWarp = 0;
          if (dist < lensRadius && mouseX > 0) {
            const force = Math.pow(1 - dist / lensRadius, 1.8) * 44;
            lensWarp = -Math.sin((dist / lensRadius) * Math.PI) * force;
          }

          const y = baseY + macroArc + w1 + w2 + w3 + lensWarp;
          points.push({ x, y });
        }

        // Draw smooth Catmull-Rom cubic bezier spline through points
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < points.length - 1; i++) {
          const p0 = i === 0 ? points[0] : points[i - 1];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = i + 2 < points.length ? points[i + 2] : p2;

          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = p1.y + (p2.y - p0.y) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = p2.y - (p3.y - p1.y) / 6;

          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }

        // Color tone mapping
        let baseRgba = "168, 134, 82"; // Antique bronze
        if (ribbon.color === "amber") baseRgba = "205, 142, 54"; // Warm golden amber
        if (ribbon.color === "slate") baseRgba = "68, 76, 92";   // Soft slate graphite

        // Gradient stroke: soft feathering at edges, rich vivid luster in middle
        const lineGrad = ctx.createLinearGradient(0, 0, width, 0);
        lineGrad.addColorStop(0, `rgba(${baseRgba}, 0)`);
        lineGrad.addColorStop(0.10, `rgba(${baseRgba}, ${ribbon.alpha * 0.55})`);
        lineGrad.addColorStop(0.38, `rgba(${baseRgba}, ${ribbon.alpha})`);
        lineGrad.addColorStop(0.70, `rgba(${baseRgba}, ${ribbon.alpha * 0.75})`);
        lineGrad.addColorStop(0.92, `rgba(${baseRgba}, ${ribbon.alpha * 0.15})`);
        lineGrad.addColorStop(1, `rgba(${baseRgba}, 0)`);

        ctx.save();
        // Soft atmospheric edge diffusion
        ctx.shadowColor = `rgba(${baseRgba}, ${ribbon.alpha * 0.45})`;
        ctx.shadowBlur = 5;
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = ribbon.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
      });

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      mediaQuery.removeEventListener("change", handleMotionChange);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      style={{ display: "block" }}
    />
  );
}
