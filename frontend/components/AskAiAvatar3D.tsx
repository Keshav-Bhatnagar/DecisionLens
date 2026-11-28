"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export type AvatarMood = "idle" | "listening" | "thinking" | "speaking" | "active";

interface AskAiAvatar3DProps {
  state?: AvatarMood;
  size?: number;
  className?: string;
}

function createStudioEnvMap(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#fffdf7");
    grad.addColorStop(0.45, "#f3ead6");
    grad.addColorStop(0.55, "#c5b99e");
    grad.addColorStop(1, "#6f6454");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);

    g.fillStyle = "rgba(255,255,255,0.95)";
    g.fillRect(90, 28, 120, 42);
    g.fillRect(320, 40, 85, 30);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

function createOwlIrisTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (ctx) {
    const cx = 256;
    const cy = 128;

    ctx.fillStyle = "#faf6ee";
    ctx.fillRect(0, 0, 512, 256);

    const irisGrad = ctx.createRadialGradient(cx, cy, 12, cx, cy, 62);
    irisGrad.addColorStop(0, "#fbbf24");
    irisGrad.addColorStop(0.55, "#b45309");
    irisGrad.addColorStop(0.88, "#451a03");
    irisGrad.addColorStop(1, "#1c1917");
    ctx.beginPath();
    ctx.arc(cx, cy, 64, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 64; i++) {
      ctx.rotate((Math.PI * 2) / 64);
      ctx.strokeStyle =
        i % 2 === 0 ? "rgba(254, 240, 138, 0.36)" : "rgba(69, 26, 3, 0.25)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(59, 0);
      ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fillStyle = "#0e0d0c";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx + 15, cy - 15, 11, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx - 12, cy + 11, 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Interactive 3D Brass-Spectacles Owl ("Ollie") Companion built with Three.js.
 * Designed using UX psychology cues: non-humanoid Pixar-style mascot avoiding
 * the uncanny valley, periodic shutter blinks, asymmetric thinking gaze aversion,
 * listening lean-in, 360-degree drag inspection, and click-to-pat happy bounce.
 */
export default function AskAiAvatar3D({
  state = "idle",
  size = 112,
  className = "",
}: AskAiAvatar3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<AvatarMood>(state);
  stateRef.current = state;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, 0.15, 5.4);

    scene.add(new THREE.AmbientLight(0xfffcf5, 0.68));
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
    keyLight.position.set(3.5, 6, 5.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(512, 512);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0e7ff, 0.35);
    fillLight.position.set(-4, 1, 3);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xfde68a, 1.2, 14);
    rimLight.position.set(-2.5, 3.2, -3.5);
    scene.add(rimLight);

    const envMap = track(createStudioEnvMap());
    const irisTex = track(createOwlIrisTexture());

    const orbitRoot = new THREE.Group();
    scene.add(orbitRoot);

    // Shadow Floor
    const floorMat = track(new THREE.ShadowMaterial({ opacity: 0.18 }));
    const shadowFloor = new THREE.Mesh(
      track(new THREE.CircleGeometry(2.1, 36)),
      floorMat
    );
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.position.y = -1.42;
    shadowFloor.receiveShadow = true;
    scene.add(shadowFloor);

    // Walnut Perch + Brass Band
    const walnutMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x4b3621,
        roughness: 0.55,
        metalness: 0.08,
      })
    );
    const perch = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.85, 0.92, 0.22, 32)),
      walnutMat
    );
    perch.position.y = -1.32;
    perch.receiveShadow = true;
    perch.castShadow = true;
    orbitRoot.add(perch);

    const brassTrim = track(
      new THREE.MeshPhysicalMaterial({
        color: 0xc8993a,
        metalness: 0.88,
        roughness: 0.22,
        envMap,
        clearcoat: 0.5,
      })
    );
    const perchBand = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.87, 0.022, 10, 40)),
      brassTrim
    );
    perchBand.rotation.x = Math.PI / 2;
    perchBand.position.y = -1.23;
    orbitRoot.add(perchBand);

    // Owl Character Root
    const root = new THREE.Group();
    orbitRoot.add(root);

    const creamMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xf7f1e3,
        roughness: 0.52,
        metalness: 0.02,
      })
    );
    const taupeMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xd9cdb5,
        roughness: 0.62,
        metalness: 0.02,
      })
    );
    const brownMat = track(
      new THREE.MeshStandardMaterial({ color: 0x6b5c4c, roughness: 0.58 })
    );
    const beakMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0xd97706,
        roughness: 0.28,
        clearcoat: 0.6,
      })
    );
    const glassMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.16,
        roughness: 0.04,
        clearcoat: 1.0,
        envMap,
      })
    );
    const blushMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xf472b6,
        transparent: true,
        opacity: 0.14,
      })
    );

    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    const body = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.92, 32, 32)),
      creamMat
    );
    body.scale.set(1.0, 1.08, 0.92);
    body.position.y = -0.32;
    body.castShadow = true;
    bodyGroup.add(body);

    const belly = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.75, 28, 28)),
      taupeMat
    );
    belly.scale.set(0.94, 0.92, 0.58);
    belly.position.set(0, -0.42, 0.44);
    bodyGroup.add(belly);

    // Scalloped Belly Feathers
    const featherGeo = track(new THREE.SphereGeometry(0.14, 14, 14));
    for (let r = 0; r < 3; r++) {
      const count = 4 - r;
      for (let i = 0; i < count; i++) {
        const feather = new THREE.Mesh(featherGeo, creamMat);
        feather.scale.set(1.1, 0.75, 0.4);
        const xOff = (i - (count - 1) / 2) * 0.25;
        feather.position.set(xOff, -0.18 - r * 0.2, 0.79 - r * 0.05);
        bodyGroup.add(feather);
      }
    }

    // Articulated Multi-Feather Wings
    const makeWing = (side: number) => {
      const wg = new THREE.Group();
      wg.position.set(side * 0.84, -0.18, 0.02);
      bodyGroup.add(wg);

      for (let i = 0; i < 3; i++) {
        const tip = new THREE.Mesh(
          track(new THREE.SphereGeometry(0.36 - i * 0.04, 16, 16)),
          i === 0 ? taupeMat : brownMat
        );
        tip.scale.set(0.36, 1.15 - i * 0.12, 0.62);
        tip.position.set(side * (0.08 + i * 0.03), -0.18 - i * 0.16, -i * 0.06);
        tip.rotation.z = side * (-0.22 - i * 0.08);
        tip.castShadow = true;
        wg.add(tip);
      }
      return wg;
    };
    const wingL = makeWing(-1);
    const wingR = makeWing(1);

    // Tail Assembly
    const tailGeo = track(new THREE.BoxGeometry(0.24, 0.55, 0.07));
    for (let i = -1; i <= 1; i++) {
      const tail = new THREE.Mesh(tailGeo, brownMat);
      tail.position.set(i * 0.18, -0.95, -0.68);
      tail.rotation.x = 0.45;
      tail.rotation.z = -i * 0.18;
      bodyGroup.add(tail);
    }

    // Three-Toed Claws Gripping Walnut Perch
    const toeGeo = track(new THREE.SphereGeometry(0.065, 10, 10));
    [-0.32, 0.32].forEach((fx) => {
      for (let t = -1; t <= 1; t++) {
        const toe = new THREE.Mesh(toeGeo, beakMat);
        toe.scale.set(0.9, 0.85, 2.2);
        toe.position.set(fx + t * 0.08, -1.19, 0.34);
        toe.rotation.y = -t * 0.28;
        toe.rotation.x = 0.35;
        root.add(toe);
      }
    });

    // Head Group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.62, 0);
    root.add(headGroup);

    const head = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.84, 32, 32)),
      creamMat
    );
    head.scale.set(1.08, 0.92, 0.95);
    head.castShadow = true;
    headGroup.add(head);

    // Facial Discs
    const discGeo = track(new THREE.SphereGeometry(0.45, 24, 24));
    [-0.3, 0.3].forEach((dx) => {
      const disc = new THREE.Mesh(discGeo, taupeMat);
      disc.scale.set(1.05, 1.0, 0.35);
      disc.position.set(dx, 0.04, 0.6);
      headGroup.add(disc);
    });

    // Feathered Ear Tufts
    const makeTuft = (side: number) => {
      const tg = new THREE.Group();
      tg.position.set(side * 0.58, 0.66, 0.04);
      headGroup.add(tg);
      const mainT = new THREE.Mesh(
        track(new THREE.ConeGeometry(0.17, 0.42, 16)),
        brownMat
      );
      mainT.rotation.z = -side * 0.45;
      tg.add(mainT);
      const accentT = new THREE.Mesh(
        track(new THREE.ConeGeometry(0.11, 0.28, 12)),
        taupeMat
      );
      accentT.position.set(-side * 0.08, -0.05, 0.06);
      accentT.rotation.z = -side * 0.3;
      tg.add(accentT);
      return tg;
    };
    const tuftL = makeTuft(-1);
    const tuftR = makeTuft(1);

    // Clearcoat 3D Eyeballs + Wrapping Eyelids + Brass Spectacles
    const eyeballMat = track(
      new THREE.MeshPhysicalMaterial({
        map: irisTex,
        roughness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMap,
      })
    );
    const eyeballGeo = track(new THREE.SphereGeometry(0.25, 28, 28));
    const lidGeo = track(
      new THREE.SphereGeometry(0.264, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5)
    );
    const rimGeo = track(new THREE.TorusGeometry(0.295, 0.028, 12, 36));
    const glassGeo = track(new THREE.CircleGeometry(0.285, 28));

    const makeEye3D = (xPos: number) => {
      const g = new THREE.Group();
      g.position.set(xPos, 0.08, 0.66);
      headGroup.add(g);

      const eyeball = new THREE.Mesh(eyeballGeo, eyeballMat);
      eyeball.rotation.y = -Math.PI / 2;
      g.add(eyeball);

      const upperLid = new THREE.Mesh(lidGeo, creamMat);
      upperLid.rotation.x = -1.1;
      g.add(upperLid);

      const rim = new THREE.Mesh(rimGeo, brassTrim);
      rim.position.z = 0.21;
      g.add(rim);

      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.z = 0.215;
      g.add(glass);

      return { eyeball, upperLid };
    };

    const eyeL = makeEye3D(-0.34);
    const eyeR = makeEye3D(0.34);

    // Glasses Bridge + Temple Arms
    const bridge = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.09, 0.018, 10, 18, Math.PI)),
      brassTrim
    );
    bridge.position.set(0, 0.1, 0.87);
    headGroup.add(bridge);

    const armGeo = track(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 8));
    [-0.64, 0.64].forEach((ax) => {
      const arm = new THREE.Mesh(armGeo, brassTrim);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(ax, 0.09, 0.62);
      headGroup.add(arm);
    });

    // Upper & Lower Beak
    const upperBeak = new THREE.Mesh(
      track(new THREE.ConeGeometry(0.11, 0.24, 16)),
      beakMat
    );
    upperBeak.rotation.x = Math.PI / 2 + 0.35;
    upperBeak.position.set(0, -0.09, 0.86);
    headGroup.add(upperBeak);

    const lowerBeak = new THREE.Mesh(
      track(new THREE.ConeGeometry(0.075, 0.14, 12)),
      beakMat
    );
    lowerBeak.rotation.x = Math.PI / 2 - 0.2;
    lowerBeak.position.set(0, -0.15, 0.81);
    headGroup.add(lowerBeak);

    // Blush Cheeks
    const cheekGeo = track(new THREE.CircleGeometry(0.1, 18));
    [-0.56, 0.56].forEach((cx, idx) => {
      const cheek = new THREE.Mesh(cheekGeo, blushMat);
      cheek.position.set(cx, -0.14, 0.67);
      cheek.rotation.y = idx === 0 ? -0.38 : 0.38;
      headGroup.add(cheek);
    });

    // Interaction State
    const pointer = { x: 0, y: 0 };
    const smoothLook = { x: 0, y: 0 };
    const drag = { yaw: 0, pitch: 0, active: false, moved: false, lastX: 0, lastY: 0 };
    let joyTimer = 0;
    let blinkAmount = 0;
    let nextBlink = 2.8;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const dom = renderer.domElement;
    dom.style.cursor = "grab";

    const onWindowPointerMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      if (drag.active) {
        const dx = e.clientX - drag.lastX;
        const dy = e.clientY - drag.lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        drag.yaw += dx * 0.014;
        drag.pitch = Math.max(-0.5, Math.min(0.6, drag.pitch + dy * 0.01));
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      drag.active = true;
      drag.moved = false;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      dom.style.cursor = "grabbing";
    };

    const onWindowPointerUp = () => {
      if (drag.active && !drag.moved) {
        joyTimer = 1.25;
      }
      drag.active = false;
      dom.style.cursor = "grab";
    };

    window.addEventListener("pointermove", onWindowPointerMove);
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onWindowPointerUp);

    let animId = 0;
    const clock = new THREE.Clock();

    const renderFrame = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();
      const mode = stateRef.current;

      if (joyTimer > 0) joyTimer = Math.max(0, joyTimer - dt);

      if (t > nextBlink) {
        blinkAmount = 1.0;
        nextBlink = t + 3.0 + Math.random() * 2.1;
      }
      blinkAmount = Math.max(0, blinkAmount - dt * 6.5);

      let tx = pointer.x;
      let ty = pointer.y;
      if (mode === "thinking") {
        tx = -0.45 + Math.sin(t * 2.1) * 0.1;
        ty = 0.38 + Math.cos(t * 1.4) * 0.08;
      }
      smoothLook.x += (tx - smoothLook.x) * 0.09;
      smoothLook.y += (ty - smoothLook.y) * 0.09;

      const hop =
        joyTimer > 0
          ? Math.abs(Math.sin(joyTimer * Math.PI * 3.0)) * 0.26 * joyTimer
          : 0;
      const breath = Math.sin(t * 3.0) * 0.026;
      const squashY =
        1.0 + breath + (joyTimer > 0 ? Math.sin(joyTimer * 18) * 0.07 : 0);
      const squashXZ = 1.0 - breath * 0.7;
      const isSpeaking = mode === "speaking" || mode === "active";
      const roll =
        mode === "thinking"
          ? 0.2
          : mode === "listening"
          ? 0.12
          : -smoothLook.x * 0.13;

      orbitRoot.rotation.y += (drag.yaw - orbitRoot.rotation.y) * 0.14;
      orbitRoot.rotation.x += (drag.pitch - orbitRoot.rotation.x) * 0.14;
      root.position.y = hop;
      bodyGroup.scale.set(squashXZ, squashY, squashXZ);
      headGroup.rotation.y = smoothLook.x * 0.45;
      headGroup.rotation.x =
        -smoothLook.y * 0.28 + (mode === "speaking" ? Math.sin(t * 9) * 0.05 : 0);
      headGroup.rotation.z = roll;

      const flutter =
        joyTimer > 0
          ? Math.sin(t * 20) * 0.42
          : mode === "speaking"
          ? Math.sin(t * 8) * 0.1
          : Math.sin(t * 2.4) * 0.03;
      wingL.rotation.z = flutter;
      wingR.rotation.z = -flutter;
      lowerBeak.rotation.x =
        Math.PI / 2 -
        0.2 -
        (mode === "speaking" ? Math.abs(Math.sin(t * 11)) * 0.28 : 0);

      const tuftAngle = mode === "listening" || joyTimer > 0 ? 0.24 : 0.0;
      tuftL.rotation.z += (tuftAngle - tuftL.rotation.z) * 0.15;
      tuftR.rotation.z += (-tuftAngle - tuftR.rotation.z) * 0.15;

      eyeL.eyeball.rotation.y = -Math.PI / 2 + smoothLook.x * 0.35;
      eyeL.eyeball.rotation.z = smoothLook.y * 0.25;
      eyeR.eyeball.rotation.y = -Math.PI / 2 + smoothLook.x * 0.35;
      eyeR.eyeball.rotation.z = smoothLook.y * 0.25;

      const lidRot =
        blinkAmount > 0.45
          ? 0.65
          : joyTimer > 0 || isSpeaking
          ? -0.45
          : mode === "listening"
          ? -1.35
          : -1.1;
      eyeL.upperLid.rotation.x += (lidRot - eyeL.upperLid.rotation.x) * 0.36;
      eyeR.upperLid.rotation.x += (lidRot - eyeR.upperLid.rotation.x) * 0.36;
      blushMat.opacity = joyTimer > 0 || isSpeaking ? 0.48 : 0.14;

      renderer.render(scene, camera);
    };

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (document.hidden) return;
      renderFrame();
    };

    if (prefersReducedMotion) {
      renderer.render(scene, camera);
    } else {
      animate();
    }

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("pointermove", onWindowPointerMove);
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onWindowPointerUp);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [size]);

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size }}
      className={`shrink-0 select-none ${className}`}
      title="Ollie — Drag to rotate 360° or click to pat"
    />
  );
}
