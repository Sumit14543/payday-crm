import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function DiwaliCelebration() {
  const [isOpen, setIsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Automatically trigger once per session during Diwali season
    const hasSeen = sessionStorage.getItem("diwali_wishes_lottie_style_2026");
    if (!hasSeen) {
      setIsOpen(true);
      sessionStorage.setItem("diwali_wishes_lottie_style_2026", "true");
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

    // Color palettes for Radial Ray Fireworks (From User Image 1)
    const burstPalettes = [
      { inner: "#e11d48", outer: "#fde047", accent: "#fbbf24" }, // Ruby Pink + Gold (Left in Img 1)
      { inner: "#10b981", outer: "#fde047", accent: "#34d399" }, // Emerald Green + Lemon (Center in Img 1)
      { inner: "#f59e0b", outer: "#ffffff", accent: "#fef08a" }, // Radiant Gold + White (Top Right in Img 1)
      { inner: "#f43f5e", outer: "#fbcfe8", accent: "#fda4af" }, // Rose Pink + Champagne (Right in Img 1)
      { inner: "#06b6d4", outer: "#67e8f9", accent: "#a5f3fc" }, // Cyan + Sky
      { inner: "#a855f7", outer: "#fde047", accent: "#c084fc" }  // Purple + Gold
    ];

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
      palette: typeof burstPalettes[0];
    }

    interface RadialBurst {
      x: number;
      y: number;
      palette: typeof burstPalettes[0];
      raysCount: number;
      currentRadius: number;
      maxRadius: number;
      speed: number;
      alpha: number;
      decay: number;
      rayLength: number;
    }

    const rockets: StripedRocket[] = [];
    const radialBursts: RadialBurst[] = [];

    const createStripedRocket = (customStartX?: number, customTargetY?: number) => {
      const sx = customStartX !== undefined ? customStartX : Math.random() * (canvas.width - 240) + 120;
      const tx = sx + (Math.random() - 0.5) * 120;
      const ty = customTargetY !== undefined ? customTargetY : Math.random() * (canvas.height * 0.42) + 50;
      const speed = Math.random() * 3 + 8.5;
      const angle = Math.atan2(ty - canvas.height, tx - sx);

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
        palette: burstPalettes[Math.floor(Math.random() * burstPalettes.length)],
      });
    };

    const triggerBurst = (x: number, y: number, palette: typeof burstPalettes[0]) => {
      radialBursts.push({
        x,
        y,
        palette,
        raysCount: 32,
        currentRadius: 8,
        maxRadius: Math.random() * 40 + 80,
        speed: Math.random() * 2 + 3.8,
        alpha: 1,
        decay: 0.016,
        rayLength: 18,
      });
    };

    // Initial volley of 3 striped rockets
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (isRunning) createStripedRocket();
      }, i * 320);
    }

    let lastAutoLaunch = Date.now();

    const loop = () => {
      // 100% transparent clear every frame - website stays crystal clear!
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = Date.now();
      if (now - lastAutoLaunch > 1100 && rockets.length < 5) {
        createStripedRocket();
        lastAutoLaunch = now;
      }

      // Update & Draw Rockets
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
          ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
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
          triggerBurst(r.x, r.y, r.palette);
          rockets.splice(i, 1);
        }
      }

      // Update & Draw Radial Ray Fireworks (Image 1 Style)
      for (let i = radialBursts.length - 1; i >= 0; i--) {
        const b = radialBursts[i];
        b.currentRadius += b.speed;
        b.speed *= 0.94;
        b.alpha -= b.decay;

        if (b.alpha <= 0) {
          radialBursts.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, b.alpha);

        const step = (Math.PI * 2) / b.raysCount;
        for (let j = 0; j < b.raysCount; j++) {
          const a = j * step;
          const isEven = j % 2 === 0;

          const startR = b.currentRadius;
          const endR = b.currentRadius + (isEven ? b.rayLength * 1.3 : b.rayLength * 0.8);

          const sx = b.x + Math.cos(a) * startR;
          const sy = b.y + Math.sin(a) * startR;
          const ex = b.x + Math.cos(a) * endR;
          const ey = b.y + Math.sin(a) * endR;

          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.strokeStyle = isEven ? b.palette.inner : b.palette.outer;
          ctx.lineWidth = isEven ? 2.4 : 1.5;
          ctx.stroke();

          // Sparkle tip on ray
          ctx.beginPath();
          ctx.arc(ex, ey, isEven ? 2 : 1.2, 0, Math.PI * 2);
          ctx.fillStyle = b.palette.accent;
          ctx.fill();
        }

        ctx.restore();
      }

      if (isRunning) {
        animationFrameId = requestAnimationFrame(loop);
      }
    };

    animationFrameId = requestAnimationFrame(loop);

    (window as any).__fireDiwaliRockets = () => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => createStripedRocket(), i * 180);
      }
    };

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, [isOpen]);

  const handleLaunchMore = () => {
    if (typeof (window as any).__fireDiwaliRockets === "function") {
      (window as any).__fireDiwaliRockets();
    }
  };

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

      {/* FULL SCREEN TRANSPARENT OVERLAY (No solid background, CRM dashboard is clearly visible!) */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/35 backdrop-blur-[4px] px-4 select-none cursor-pointer animate-in fade-in duration-300"
        >
          {/* Transparent Fireworks Canvas */}
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

          {/* Centerpiece: Scalloped Saffron/Gold Diwali Arch with 3 Diyas & Rotating Rangoli */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-20 flex flex-col items-center justify-center text-center max-w-lg pointer-events-auto"
          >
            {/* Rotating Colorful Rangoli Mandala behind the Emblem */}
            <div
              className="absolute -top-16 w-80 h-80 pointer-events-none opacity-45"
              style={{ animation: "spin 35s linear infinite" }}
            >
              <svg viewBox="0 0 200 200" className="w-full h-full">
                <defs>
                  <linearGradient id="petalGradReact" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ec4899" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
                <g transform="translate(100,100)">
                  <g stroke="#fbbf24" strokeWidth="1" fill="url(#petalGradReact)" opacity="0.8">
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                      <path
                        key={deg}
                        d="M0,0 Q-15,-45 0,-70 Q15,-45 0,0"
                        transform={`rotate(${deg})`}
                      />
                    ))}
                  </g>
                  <circle cx="0" cy="0" r="22" fill="#d97706" stroke="#fde047" strokeWidth="2" />
                  <circle cx="0" cy="0" r="12" fill="#ef4444" />
                  <circle cx="0" cy="0" r="5" fill="#fef08a" />
                </g>
              </svg>
            </div>

            {/* The Scalloped Festive Diwali Arch Badge */}
            <div className="relative w-[340px] sm:w-[380px] pt-8 pb-4 px-6 rounded-[36px] bg-gradient-to-b from-[#ea580c] via-[#c2410c] to-[#7c2d12] border-2 border-amber-300 shadow-[0_0_45px_rgba(245,158,11,0.65)] backdrop-blur-md">
              
              <div className="absolute top-3 left-4 text-amber-200 text-xs">✦</div>
              <div className="absolute top-3 right-4 text-amber-200 text-xs">✦</div>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-widest border border-amber-200 shadow">
                FESTIVAL OF LIGHTS
              </div>

              {/* Crisp Serif 'HAPPY' */}
              <p className="text-xl sm:text-2xl font-bold tracking-[0.25em] text-[#fff8e7] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] font-serif mb-0">
                HAPPY
              </p>

              {/* Crisp Script 'Diwali' */}
              <h1
                className="text-6xl sm:text-7xl font-bold text-[#fffbeb] drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)] leading-[0.95] my-1 select-none"
                style={{ fontFamily: "'Great Vibes', 'Dancing Script', 'Brush Script MT', cursive" }}
              >
                Diwali
              </h1>

              {/* Three Clay Diyas Array at Base of Arch (From User Image 2) */}
              <div className="mt-4 flex items-end justify-center gap-6 sm:gap-8 pt-1">
                {/* Left Diya */}
                <div className="flex flex-col items-center">
                  <div
                    className="h-4 w-3 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-white shadow-[0_0_12px_#f59e0b] animate-pulse"
                    style={{ animationDuration: "0.5s" }}
                  />
                  <div className="h-2.5 w-8 rounded-b-full bg-gradient-to-b from-amber-600 to-amber-950 border border-amber-400/80 shadow -mt-0.5" />
                </div>

                {/* Center Grand Diya (Elevated) */}
                <div className="flex flex-col items-center -translate-y-1 scale-110">
                  <div
                    className="h-5 w-3.5 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-white shadow-[0_0_16px_#f59e0b] animate-pulse"
                    style={{ animationDuration: "0.4s" }}
                  />
                  <div className="h-3 w-10 rounded-b-full bg-gradient-to-b from-amber-600 to-amber-950 border border-amber-400/90 shadow-[0_3px_10px_rgba(245,158,11,0.6)] -mt-0.5" />
                </div>

                {/* Right Diya */}
                <div className="flex flex-col items-center">
                  <div
                    className="h-4 w-3 rounded-full bg-gradient-to-t from-orange-600 via-amber-400 to-white shadow-[0_0_12px_#f59e0b] animate-pulse"
                    style={{ animationDuration: "0.6s" }}
                  />
                  <div className="h-2.5 w-8 rounded-b-full bg-gradient-to-b from-amber-600 to-amber-950 border border-amber-400/80 shadow -mt-0.5" />
                </div>
              </div>

            </div>

            {/* High-Contrast Legible Wish Tagline Below Badge */}
            <p className="mt-5 text-[15px] sm:text-[17px] font-semibold text-[#fffbeb] tracking-wide drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
              May your life shine with happiness and prosperity
            </p>

            {/* Action Buttons */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleLaunchMore}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 px-5 py-2.5 text-xs font-black text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.6)] hover:scale-105 active:scale-95 transition cursor-pointer"
              >
                <span>🚀</span>
                <span>Fire Striped Rockets</span>
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 rounded-full border border-amber-300 bg-black/50 px-5 py-2.5 text-xs font-bold text-amber-200 shadow hover:bg-black/70 transition cursor-pointer backdrop-blur-sm"
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
