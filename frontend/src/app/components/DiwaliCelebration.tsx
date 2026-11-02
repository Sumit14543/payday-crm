import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function DiwaliCelebration() {
  const [isOpen, setIsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Automatically trigger on page load during Diwali season
    const hasSeen = sessionStorage.getItem("diwali_wishes_nextbox_style_2026");
    if (!hasSeen) {
      setIsOpen(true);
      sessionStorage.setItem("diwali_wishes_nextbox_style_2026", "true");
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
      sparkle?: boolean;
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
          decay: Math.random() * 0.015 + 0.012,
          radius: Math.random() * 2 + 1,
          sparkle: Math.random() > 0.5,
        });
      }
    };

    // Central sparkles around the Diwali text
    const addCentralSparkles = () => {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2 - 20;
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 120 + 20;
        particles.push({
          x: centerX + Math.cos(angle) * dist,
          y: centerY + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          decay: Math.random() * 0.02 + 0.01,
          radius: Math.random() * 2 + 1,
          sparkle: true,
        });
      }
    };

    // Initial rockets barrage from bottom to top
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (isRunning) createRocket();
      }, i * 320);
    }

    let lastAutoLaunch = Date.now();
    let lastSparkleTime = Date.now();

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = Date.now();
      // Continuous rocket launch
      if (now - lastAutoLaunch > 900 && rockets.length < 5) {
        createRocket();
        lastAutoLaunch = now;
      }

      // Continuous festive sparkles around the text
      if (now - lastSparkleTime > 120) {
        addCentralSparkles();
        lastSparkleTime = now;
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
        p.vy += 0.05; // soft gravity
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
        ctx.arc(p.x, p.y, p.sparkle && Math.random() > 0.4 ? p.radius * 1.5 : p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
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
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-amber-400/60 bg-slate-950/80 px-4 py-2 text-xs font-bold text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.5)] hover:scale-105 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
      >
        <span className="text-base animate-bounce" style={{ animationDuration: "2s" }}>🪔</span>
        <span className="tracking-widest uppercase font-serif">Happy Diwali</span>
      </button>

      {/* Full-Screen Minimalist Cinematic Overlay (NextBigBox Inspired) */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0d0918]/85 backdrop-blur-md px-4 select-none cursor-pointer animate-in fade-in duration-500"
        >
          {/* Fireworks & Rockets Canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 w-full h-full pointer-events-none"
          />

          {/* Close hint top right */}
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
            <p className="font-serif text-xs sm:text-sm font-semibold tracking-[0.35em] uppercase text-amber-200/90 drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)] mb-1">
              WISHING YOU A
            </p>

            {/* Serif 'Happy' */}
            <h2
              className="font-serif text-3xl sm:text-5xl font-normal tracking-wide text-amber-100 drop-shadow-[0_4px_16px_rgba(254,240,138,0.7)]"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Happy
            </h2>

            {/* Glowing Calligraphy Script 'Diwali' */}
            <div className="relative my-0 sm:-my-2">
              {/* Confetti & Sparkles cluster behind Diwali */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="absolute -top-3 -left-6 text-xl text-yellow-300 animate-pulse drop-shadow-[0_0_8px_#fde047]">✦</span>
                <span className="absolute -top-4 right-1 text-base text-pink-400 animate-ping drop-shadow-[0_0_8px_#f43f5e]" style={{ animationDuration: "3s" }}>✨</span>
                <span className="absolute -bottom-2 -left-4 text-xs text-cyan-300 animate-pulse drop-shadow-[0_0_6px_#06b6d4]">✦</span>
                <span className="absolute -bottom-2 right-4 text-xl text-amber-400 animate-pulse drop-shadow-[0_0_10px_#f59e0b]">✨</span>
                <span className="absolute top-1/2 -right-8 text-sm text-emerald-400 animate-ping drop-shadow-[0_0_6px_#10b981]" style={{ animationDuration: "2.5s" }}>✦</span>
              </div>

              <h1
                className="text-6xl sm:text-8xl md:text-9xl font-bold tracking-tight text-[#ffc837]"
                style={{
                  fontFamily: "'Brush Script MT', 'Dancing Script', 'Caveat', cursive",
                  textShadow: `
                    0 0 10px #ffe57f,
                    0 0 25px #ffb300,
                    0 0 45px #ff8f00,
                    0 0 70px #ff6f00,
                    0 0 100px #e65100
                  `,
                  transform: "rotate(-2deg)",
                  letterSpacing: "1px",
                }}
              >
                Diwali
              </h1>
            </div>

            {/* Glowing Diya in Center with Horizontal Light Rays */}
            <div className="mt-3 sm:mt-5 flex items-center justify-center w-full max-w-md gap-4">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-amber-400/80 to-amber-300" />
              
              {/* Illuminated Diya */}
              <div className="relative flex flex-col items-center">
                {/* Diya Flame Glow */}
                <div
                  className="h-5 w-3.5 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-yellow-100 shadow-[0_0_18px_#f59e0b] animate-pulse"
                  style={{ animationDuration: "0.6s" }}
                />
                {/* Diya Clay Base */}
                <div className="h-3 w-8 rounded-b-full bg-gradient-to-b from-amber-600 to-amber-900 border border-amber-400/70 shadow-[0_4px_12px_rgba(245,158,11,0.6)]" />
              </div>

              <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-amber-400/80 to-amber-300" />
            </div>

            {/* Bottom Subtitle: May your life shine with happiness and prosperity */}
            <p className="mt-5 text-sm sm:text-base font-normal text-amber-100/90 tracking-wide font-sans drop-shadow-[0_2px_10px_rgba(245,158,11,0.4)]">
              May your life shine with happiness and prosperity
            </p>

            {/* Click to close hint */}
            <p className="mt-8 text-[11px] text-amber-200/40 tracking-widest uppercase">
              Click anywhere to continue
            </p>
          </div>
        </div>
      )}
    </>
  );
}
