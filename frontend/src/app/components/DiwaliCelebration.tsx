import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function DiwaliCelebration() {
  const [isOpen, setIsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Automatically trigger once per session during Diwali season
    const hasSeen = sessionStorage.getItem("diwali_wishes_clean_v5_2026");
    if (!hasSeen) {
      setIsOpen(true);
      sessionStorage.setItem("diwali_wishes_clean_v5_2026", "true");
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
      "#fde047", "#f59e0b", "#fbbf24", "#fb923c", 
      "#f43f5e", "#ec4899", "#a855f7", "#38bdf8", 
      "#34d399", "#ffffff", "#fef08a"
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
      sparkle?: boolean;
    }

    interface StripedRocket {
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      vx: number;
      vy: number;
      angle: number;
      speed: number;
      trail: { x: number; y: number }[];
      exploded: boolean;
      color: string;
    }

    const rockets: StripedRocket[] = [];
    const particles: Particle[] = [];
    const ambientEmbers: Particle[] = [];

    // Floating celebratory sparkles around the center typography
    const spawnEmber = () => {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2 - 20;
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 240 + 40;
        ambientEmbers.push({
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * (dist * 0.7),
          vx: (Math.random() - 0.5) * 0.7,
          vy: (Math.random() - 0.5) * 0.7 - 0.2, // gentle upward drift
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          decay: Math.random() * 0.007 + 0.005,
          radius: Math.random() * 2.4 + 1.2,
          sparkle: Math.random() > 0.4,
        });
      }
    };

    const createStripedRocket = (customStartX?: number, customTargetY?: number) => {
      const sx = customStartX !== undefined ? customStartX : Math.random() * (canvas.width - 240) + 120;
      const tx = sx + (Math.random() - 0.5) * 120;
      const ty = customTargetY !== undefined ? customTargetY : Math.random() * (canvas.height * 0.38) + 40;
      const speed = Math.random() * 3 + 8.5;
      const angle = Math.atan2(ty - canvas.height, tx - sx);
      const color = colors[Math.floor(Math.random() * colors.length)];

      rockets.push({
        x: sx,
        y: canvas.height,
        targetX: tx,
        targetY: ty,
        speed,
        angle,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        trail: [],
        exploded: false,
        color,
      });
    };

    const explodeRocket = (rx: number, ry: number, baseColor: string) => {
      const count = Math.floor(Math.random() * 32) + 45;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 1.2;
        particles.push({
          x: rx,
          y: ry,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: Math.random() > 0.3 ? baseColor : colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          decay: Math.random() * 0.015 + 0.011,
          radius: Math.random() * 2.2 + 1,
        });
      }
    };

    // Initial rockets barrage
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (isRunning) createStripedRocket();
      }, i * 300);
    }

    let lastAutoLaunch = Date.now();
    let lastSparkle = Date.now();

    const loop = () => {
      // 100% transparent clear every frame - website stays crystal clear!
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = Date.now();

      // Launch rockets from bottom
      if (now - lastAutoLaunch > 950 && rockets.length < 5) {
        createStripedRocket();
        lastAutoLaunch = now;
      }

      // Continuous floating festive embers
      if (now - lastSparkle > 75 && ambientEmbers.length < 130) {
        spawnEmber();
        lastSparkle = now;
      }

      // Update & Draw Striped Rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 10) r.trail.shift();

        r.x += r.vx;
        r.y += r.vy;

        // Draw golden spark smoke trail
        for (let j = 0; j < r.trail.length; j++) {
          const pt = r.trail[j];
          const a = (j / r.trail.length) * 0.85;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(251, 191, 36, ${a})`;
          ctx.fill();
        }

        // Draw Striped Festive Rocket Body
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.angle + Math.PI / 2);

        // Rocket Nose Cone (Red)
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(-4, -4);
        ctx.lineTo(4, -4);
        ctx.closePath();
        ctx.fillStyle = "#ef4444";
        ctx.fill();

        // Rocket Body (Yellow cylinder with Red stripes)
        ctx.fillStyle = "#fde047";
        ctx.fillRect(-3, -4, 6, 14);

        ctx.fillStyle = "#dc2626";
        ctx.fillRect(-3, -1, 6, 3);
        ctx.fillRect(-3, 5, 6, 3);

        // Rocket Tail Stick
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(0, 24);
        ctx.stroke();

        ctx.restore();

        if (r.vy >= 0 || r.y <= r.targetY) {
          r.exploded = true;
          explodeRocket(r.x, r.y, r.color);
          rockets.splice(i, 1);
        }
      }

      // Update & Draw Explosion Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.vy += 0.05; // gravity
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
        ctx.shadowBlur = 9;
        ctx.fill();
        ctx.restore();
      }

      // Update & Draw Ambient Sparkler Embers
      for (let i = ambientEmbers.length - 1; i >= 0; i--) {
        const e = ambientEmbers[i];
        e.x += e.vx;
        e.y += e.vy;
        e.alpha -= e.decay;

        if (e.alpha <= 0) {
          ambientEmbers.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, e.alpha);
        ctx.beginPath();
        const r = e.sparkle && Math.random() > 0.4 ? e.radius * 1.4 : e.radius;
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      }

      if (isRunning) {
        animationFrameId = requestAnimationFrame(loop);
      }
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, [isOpen]);

  return (
    <>
      {/* Floating Diya Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Diwali Celebration"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-amber-400/50 bg-black/60 px-4 py-2 text-xs font-bold text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
      >
        <span className="text-base animate-bounce" style={{ animationDuration: "2s" }}>🪔</span>
        <span className="tracking-widest uppercase font-serif">Happy Diwali</span>
      </button>

      {/* FULL SCREEN PURE TRANSPARENT FROSTED-GLASS OVERLAY */}
      {/* NO orange card, NO buttons, Website is clearly visible through soft blur! */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/30 backdrop-blur-[5px] px-4 select-none cursor-pointer animate-in fade-in duration-300"
        >
          {/* Fireworks & Rockets Canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 w-full h-full pointer-events-none"
          />

          {/* Close button top right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="absolute top-6 right-6 z-30 rounded-full border border-amber-400/40 bg-black/40 p-2 text-amber-200 hover:bg-black/70 hover:text-white transition cursor-pointer backdrop-blur-sm"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* LEFT SIDE DECORATED DIYA */}
          <div className="absolute left-6 sm:left-14 top-1/2 -translate-y-1/2 hidden md:flex flex-col items-center pointer-events-none opacity-90 scale-110">
            <div
              className="h-7 w-4.5 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-white shadow-[0_0_22px_#f59e0b] animate-pulse"
              style={{ animationDuration: "0.5s" }}
            />
            <div className="h-3.5 w-14 rounded-b-full bg-gradient-to-b from-amber-600 to-amber-950 border border-amber-400/80 shadow-[0_4px_16px_rgba(245,158,11,0.6)] -mt-0.5" />
          </div>

          {/* RIGHT SIDE DECORATED DIYA */}
          <div className="absolute right-6 sm:right-14 top-1/2 -translate-y-1/2 hidden md:flex flex-col items-center pointer-events-none opacity-90 scale-110">
            <div
              className="h-7 w-4.5 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-white shadow-[0_0_22px_#f59e0b] animate-pulse"
              style={{ animationDuration: "0.6s" }}
            />
            <div className="h-3.5 w-14 rounded-b-full bg-gradient-to-b from-amber-600 to-amber-950 border border-amber-400/80 shadow-[0_4px_16px_rgba(245,158,11,0.6)] -mt-0.5" />
          </div>

          {/* CENTER: PURE FLOATING TYPOGRAPHY (Zero Card, Zero Orange Box, Zero Buttons) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-20 flex flex-col items-center justify-center text-center max-w-2xl px-6 pointer-events-auto"
          >
            {/* Top Text: W I S H I N G   Y O U   A */}
            <p className="text-xs sm:text-sm font-semibold tracking-[0.45em] uppercase text-amber-200 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] mb-1">
              W I S H I N G &nbsp; Y O U &nbsp; A
            </p>

            {/* Serif 'Happy' */}
            <h2
              className="text-4xl sm:text-6xl font-normal tracking-wide text-[#fff9eb] drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] mt-1 mb-0"
              style={{ fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif" }}
            >
              Happy
            </h2>

            {/* Glowing Golden Script 'Diwali' */}
            <div className="relative my-0 py-1">
              {/* Star sparkles */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="absolute -top-3 -left-10 text-2xl text-yellow-300 animate-pulse drop-shadow-[0_0_8px_#fde047]">✦</span>
                <span className="absolute -top-5 right-4 text-xl text-pink-400 animate-ping drop-shadow-[0_0_8px_#f43f5e]" style={{ animationDuration: "3s" }}>✨</span>
                <span className="absolute -bottom-1 -left-8 text-base text-cyan-300 animate-pulse drop-shadow-[0_0_6px_#06b6d4]">✦</span>
                <span className="absolute -bottom-2 right-8 text-2xl text-amber-400 animate-pulse drop-shadow-[0_0_10px_#f59e0b]">✨</span>
                <span className="absolute top-1/2 -right-12 text-lg text-emerald-400 animate-ping drop-shadow-[0_0_6px_#10b981]" style={{ animationDuration: "2.5s" }}>✦</span>
              </div>

              <h1
                className="text-8xl sm:text-[9.5rem] md:text-[10.5rem] font-bold leading-[0.9] select-none text-[#ffc837]"
                style={{
                  fontFamily: "'Great Vibes', 'Dancing Script', 'Brush Script MT', cursive",
                  textShadow: `
                    0 0 14px #ffe57f,
                    0 0 28px #ffb300,
                    0 0 45px #ff8f00,
                    0 0 70px #ff6f00,
                    0 4px 20px rgba(0, 0, 0, 0.95)
                  `,
                  transform: "rotate(-3deg)",
                }}
              >
                Diwali
              </h1>
            </div>

            {/* Center Glowing Diya with Horizontal Golden Rays */}
            <div className="mt-4 sm:mt-6 flex items-center justify-center w-full max-w-xs sm:max-w-md gap-4">
              <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent via-amber-400 to-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
              
              {/* Center Diya */}
              <div className="relative flex flex-col items-center px-1">
                <div
                  className="h-5 w-3.5 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-yellow-100 shadow-[0_0_18px_#f59e0b] animate-pulse"
                  style={{ animationDuration: "0.5s" }}
                />
                <div className="h-3 w-10 rounded-b-full bg-gradient-to-b from-amber-600 to-amber-950 border border-amber-400/80 shadow-[0_3px_10px_rgba(245,158,11,0.6)] -mt-0.5" />
              </div>

              <div className="h-[1.5px] flex-1 bg-gradient-to-l from-transparent via-amber-400 to-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
            </div>

            {/* Bottom Subtitle: Crisp High-Contrast Legibility */}
            <p className="mt-6 text-[15px] sm:text-[17px] font-medium text-[#fffbeb] tracking-wide drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
              May your life shine with happiness and prosperity
            </p>

            {/* Subtle dismiss instruction */}
            <p className="mt-8 text-[11px] text-amber-200/50 tracking-widest uppercase drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
              Click anywhere to continue
            </p>
          </div>
        </div>
      )}
    </>
  );
}
