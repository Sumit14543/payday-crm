import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function DiwaliCelebration() {
  const [isOpen, setIsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Automatically trigger on page load during Diwali season
    const hasSeen = sessionStorage.getItem("diwali_wishes_crisp_v3_2026");
    if (!hasSeen) {
      setIsOpen(true);
      sessionStorage.setItem("diwali_wishes_crisp_v3_2026", "true");
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
      "#fef08a", "#fde047", "#f59e0b", "#fbbf24", 
      "#f97316", "#ef4444", "#ec4899", "#8b5cf6", 
      "#06b6d4", "#10b981", "#ffffff"
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

    const createRocket = (customStartX?: number, customTargetY?: number) => {
      const sx = customStartX !== undefined ? customStartX : Math.random() * (canvas.width - 200) + 100;
      const tx = sx + (Math.random() - 0.5) * 120;
      const ty = customTargetY !== undefined ? customTargetY : Math.random() * (canvas.height * 0.4) + 60;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const speed = Math.random() * 3 + 8.5;
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
      const count = Math.floor(Math.random() * 30) + 40;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4.5 + 1.2;
        particles.push({
          x: rx,
          y: ry,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          alpha: 1,
          decay: Math.random() * 0.016 + 0.012,
          radius: Math.random() * 2 + 1,
        });
      }
    };

    // Initial rockets
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (isRunning) createRocket();
      }, i * 300);
    }

    let lastAutoLaunch = Date.now();

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = Date.now();
      if (now - lastAutoLaunch > 900 && rockets.length < 5) {
        createRocket();
        lastAutoLaunch = now;
      }

      // Update & Draw Rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 9) r.trail.shift();

        r.x += r.vx;
        r.y += r.vy;

        // Draw golden spark trail
        for (let j = 0; j < r.trail.length; j++) {
          const pt = r.trail[j];
          const a = (j / r.trail.length) * 0.85;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(251, 191, 36, ${a})`;
          ctx.fill();
        }

        // Draw glowing rocket tip
        ctx.save();
        ctx.beginPath();
        ctx.arc(r.x, r.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 15;
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
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-amber-400/60 bg-slate-950/85 px-4 py-2 text-xs font-bold text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:scale-105 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
      >
        <span className="text-base animate-bounce" style={{ animationDuration: "2s" }}>🪔</span>
        <span className="tracking-widest uppercase font-serif">Happy Diwali</span>
      </button>

      {/* Full-Screen Minimalist Cinematic Overlay (NextBigBox Clean Style) */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090714]/88 backdrop-blur-md px-4 select-none cursor-pointer animate-in fade-in duration-400"
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
            className="absolute top-6 right-6 z-30 rounded-full border border-amber-400/30 bg-slate-900/60 p-2 text-amber-300 hover:bg-slate-800 transition cursor-pointer"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Centerpiece Container */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-20 flex flex-col items-center justify-center text-center max-w-2xl px-6 pointer-events-auto"
          >
            {/* Top Text: W I S H I N G   Y O U   A */}
            <p className="text-xs sm:text-sm font-semibold tracking-[0.42em] uppercase text-amber-200 drop-shadow-[0_2px_8px_rgba(245,158,11,0.6)] mb-2">
              W I S H I N G &nbsp; Y O U &nbsp; A
            </p>

            {/* Serif 'Happy' */}
            <h2
              className="text-4xl sm:text-6xl font-normal tracking-wide text-[#fff8e7] drop-shadow-[0_2px_12px_rgba(254,240,138,0.7)]"
              style={{ fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif" }}
            >
              Happy
            </h2>

            {/* Glowing Calligraphy Script 'Diwali' - Sharp & High Clarity */}
            <div className="relative my-0 py-1">
              {/* Confetti & Sparkles cluster */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="absolute -top-3 -left-10 text-2xl text-yellow-300 animate-pulse drop-shadow-[0_0_8px_#fde047]">✦</span>
                <span className="absolute -top-5 right-4 text-xl text-pink-400 animate-ping drop-shadow-[0_0_8px_#f43f5e]" style={{ animationDuration: "3s" }}>✨</span>
                <span className="absolute -bottom-1 -left-8 text-base text-cyan-300 animate-pulse drop-shadow-[0_0_6px_#06b6d4]">✦</span>
                <span className="absolute -bottom-2 right-8 text-2xl text-amber-400 animate-pulse drop-shadow-[0_0_10px_#f59e0b]">✨</span>
                <span className="absolute top-1/2 -right-12 text-lg text-emerald-400 animate-ping drop-shadow-[0_0_6px_#10b981]" style={{ animationDuration: "2.5s" }}>✦</span>
              </div>

              <h1
                className="text-8xl sm:text-[9.5rem] md:text-[10.5rem] font-bold leading-[0.9] select-none"
                style={{
                  fontFamily: "'Great Vibes', 'Dancing Script', 'Brush Script MT', cursive",
                  background: "linear-gradient(180deg, #fff9db 0%, #fed843 35%, #f59e0b 70%, #d97706 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 16px rgba(245, 158, 11, 0.8)) drop-shadow(0 0 35px rgba(234, 88, 12, 0.45))",
                  transform: "rotate(-3deg)",
                }}
              >
                Diwali
              </h1>
            </div>

            {/* Glowing Diya in Center with Horizontal Light Rays */}
            <div className="mt-4 sm:mt-6 flex items-center justify-center w-full max-w-xs sm:max-w-md gap-4">
              <div className="h-[1.5px] flex-1 bg-gradient-to-r from-transparent via-amber-400 to-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              
              {/* High-Definition 3D Glowing Diya */}
              <div className="relative flex flex-col items-center px-1">
                {/* Vivid Golden Flame */}
                <div
                  className="h-5 w-3.5 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-yellow-100 shadow-[0_0_16px_#f59e0b] animate-pulse"
                  style={{ animationDuration: "0.5s" }}
                />
                {/* Diya Clay Base */}
                <div className="h-3 w-10 rounded-b-full bg-gradient-to-b from-amber-600 to-amber-950 border border-amber-400/80 shadow-[0_3px_10px_rgba(245,158,11,0.6)] -mt-0.5" />
              </div>

              <div className="h-[1.5px] flex-1 bg-gradient-to-l from-transparent via-amber-400 to-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            </div>

            {/* Bottom Subtitle: Crisp High-Contrast Legibility */}
            <p className="mt-6 text-[15px] sm:text-[17px] font-medium text-[#fffbeb] tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              May your life shine with happiness and prosperity
            </p>

            {/* Click to continue */}
            <p className="mt-8 text-[11px] text-amber-200/50 tracking-widest uppercase">
              Click anywhere to continue
            </p>
          </div>
        </div>
      )}
    </>
  );
}
