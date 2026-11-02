import React, { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";

export function DiwaliCelebration() {
  const [isOpen, setIsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Show automatically once per session during Diwali season
    const hasSeen = sessionStorage.getItem("diwali_wishes_seen_2026");
    if (!hasSeen) {
      setIsOpen(true);
      sessionStorage.setItem("diwali_wishes_seen_2026", "true");
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let isRunning = true;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const colors = [
      "#f59e0b", "#fbbf24", "#f43f5e", "#ef4444",
      "#a855f7", "#8b5cf6", "#06b6d4", "#10b981",
      "#ffffff", "#fde047", "#ec4899", "#f97316"
    ];

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      alpha: number;
      decay: number;
      radius: number;
    }

    interface Rocket {
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      vx: number;
      vy: number;
      color: string;
      trail: { x: number; y: number }[];
      exploded: boolean;
    }

    const rockets: Rocket[] = [];
    const particles: Particle[] = [];

    const createRocket = (startX?: number, targetX?: number, targetY?: number) => {
      const sx = startX !== undefined ? startX : Math.random() * (canvas.width - 160) + 80;
      const tx = targetX !== undefined ? targetX : sx + (Math.random() - 0.5) * 160;
      const ty = targetY !== undefined ? targetY : Math.random() * (canvas.height * 0.45) + 60;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const speed = Math.random() * 3 + 8;
      const angle = Math.atan2(ty - canvas.height, tx - sx);

      rockets.push({
        x: sx,
        y: canvas.height,
        targetX: tx,
        targetY: ty,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        trail: [],
        exploded: false,
      });
    };

    const explodeRocket = (rx: number, ry: number, color: string) => {
      const count = Math.floor(Math.random() * 35) + 40;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 1.5;
        particles.push({
          x: rx,
          y: ry,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          alpha: 1,
          decay: Math.random() * 0.016 + 0.012,
          radius: Math.random() * 2.2 + 1.2,
        });
      }
    };

    // Initial volley of 4 rockets
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (isRunning) createRocket();
      }, i * 260);
    }

    let lastAutoLaunch = Date.now();

    const loop = () => {
      ctx.fillStyle = "rgba(10, 8, 24, 0.22)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const now = Date.now();
      if (now - lastAutoLaunch > 1100 && rockets.length < 5) {
        createRocket();
        lastAutoLaunch = now;
      }

      // Update & Draw Rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 8) r.trail.shift();

        r.x += r.vx;
        r.y += r.vy;

        // Draw trail
        for (let j = 0; j < r.trail.length; j++) {
          const pt = r.trail[j];
          const a = (j / r.trail.length) * 0.85;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(251, 191, 36, ${a})`;
          ctx.fill();
        }

        // Draw rocket head
        ctx.save();
        ctx.beginPath();
        ctx.arc(r.x, r.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 16;
        ctx.fill();
        ctx.restore();

        if (r.vy >= 0 || r.y <= r.targetY) {
          r.exploded = true;
          explodeRocket(r.x, r.y, r.color);
          rockets.splice(i, 1);
        }
      }

      // Update & Draw Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.vy += 0.08; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      }

      if (isRunning) {
        animationFrameId = requestAnimationFrame(loop);
      }
    };

    animationFrameId = requestAnimationFrame(loop);

    (window as any).__launchDiwaliRocket = () => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => createRocket(), i * 180);
      }
    };

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, [isOpen]);

  const handleLaunchMore = () => {
    if (typeof (window as any).__launchDiwaliRocket === "function") {
      (window as any).__launchDiwaliRocket();
    }
  };

  return (
    <>
      {/* Floating Diya Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Diwali Celebration"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border-2 border-amber-400 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 px-4 py-2.5 text-xs font-black text-amber-50 shadow-[0_0_25px_rgba(245,158,11,0.6)] hover:scale-105 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
      >
        <span className="text-lg animate-bounce" style={{ animationDuration: "2s" }}>🪔</span>
        <span className="tracking-wider uppercase">Happy Diwali!</span>
        <Sparkles className="h-3.5 w-3.5 text-yellow-200" />
      </button>

      {/* Full-Screen Festive Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-300">
          
          {/* Canvas for Rockets & Fireworks */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 w-full h-full pointer-events-none"
          />

          {/* Close Button Top Right */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="absolute top-5 right-5 z-30 rounded-full border border-amber-400/40 bg-slate-900/80 p-2.5 text-amber-300 hover:bg-slate-800 hover:text-white transition shadow-lg cursor-pointer"
            title="Close Celebration"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Center Card */}
          <div className="relative z-20 w-full max-w-xl mx-auto rounded-3xl border-2 border-amber-400/70 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-[#1a0c20]/95 p-7 sm:p-9 text-center shadow-[0_0_60px_rgba(245,158,11,0.35)] backdrop-blur-xl">
            
            {/* Ornate Corner Accents */}
            <span className="absolute top-3 left-3 text-amber-400 text-sm">✦</span>
            <span className="absolute top-3 right-3 text-amber-400 text-sm">✦</span>
            <span className="absolute bottom-3 left-3 text-amber-400 text-sm">✦</span>
            <span className="absolute bottom-3 right-3 text-amber-400 text-sm">✦</span>

            {/* Sacred Mantra Tag */}
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-1 text-xs font-bold text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
              <span>✨</span>
              <span>ॐ श्री महालक्ष्म्यै नमः</span>
              <span>✨</span>
            </div>

            {/* Main Greeting */}
            <h1 className="mt-4 text-4xl sm:text-5xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-amber-400 to-orange-400 drop-shadow-[0_4px_25px_rgba(245,158,11,0.6)]">
              HAPPY DIWALI
            </h1>
            <h2 className="mt-1 text-lg sm:text-xl font-bold text-amber-200 tracking-wide">
              शुभ दीपावली
            </h2>

            {/* Ornate Divider with Diya */}
            <div className="my-5 flex items-center justify-center gap-3">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
              <span className="text-3xl filter drop-shadow-[0_0_12px_#f59e0b]">🪔</span>
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
            </div>

            {/* Message Body */}
            <p className="text-sm sm:text-base text-slate-200/90 leading-relaxed font-medium">
              May the divine light of Diyas illuminate your life with infinite peace, good health, joy, and boundless prosperity!
            </p>
            <p className="mt-3 text-xs sm:text-sm font-bold text-amber-300/95 tracking-wide">
              ✨ Waqt Finance Family wishes you & your family a Prosperous Diwali ✨
            </p>

            {/* Row of Decorated Glowing Diyas at Bottom of Card */}
            <div className="mt-6 flex items-center justify-center gap-4 sm:gap-6 py-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex flex-col items-center">
                  <div
                    className="h-4 w-3 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-yellow-100 shadow-[0_0_12px_#f59e0b] animate-pulse"
                    style={{ animationDuration: `${0.8 + (i % 3) * 0.2}s` }}
                  />
                  <div className="h-2.5 w-7 rounded-b-full bg-gradient-to-b from-amber-700 to-amber-950 border border-amber-500/60 shadow" />
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleLaunchMore}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 px-6 py-2.5 text-xs font-black text-slate-950 shadow-[0_0_25px_rgba(245,158,11,0.6)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <span>🚀</span>
                <span>Launch More Rockets!</span>
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-slate-800/80 px-5 py-2.5 text-xs font-bold text-amber-200 hover:bg-slate-700/80 transition cursor-pointer"
              >
                <span>Continue to CRM</span>
              </button>
            </div>

          </div>

        </div>
      )}
    </>
  );
}
