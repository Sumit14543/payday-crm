import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function DiwaliCelebration() {
  const [isOpen, setIsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Automatically trigger on page load during Diwali season
    const hasSeen = sessionStorage.getItem("diwali_wishes_artistic_v8_2026");
    if (!hasSeen) {
      setIsOpen(true);
      sessionStorage.setItem("diwali_wishes_artistic_v8_2026", "true");
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

    // Initial rockets
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (isRunning) createStripedRocket();
      }, i * 300);
    }

    let lastAutoLaunch = Date.now();

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = Date.now();
      if (now - lastAutoLaunch > 950 && rockets.length < 5) {
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

      // Update & Draw Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.vy += 0.05;
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
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#090615]/75 backdrop-blur-[7px] px-4 select-none cursor-pointer animate-in fade-in duration-300"
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
            className="absolute top-6 right-6 z-30 rounded-full border border-amber-400/30 bg-black/50 p-2 text-amber-200 hover:bg-black/80 hover:text-white transition cursor-pointer backdrop-blur-sm"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Ambient Warm Golden Glow Halo */}
          <div className="absolute w-[450px] sm:w-[580px] h-[350px] bg-gradient-to-t from-orange-600/30 via-amber-500/25 to-yellow-400/15 rounded-full blur-3xl pointer-events-none" />

          {/* MAIN CENTERPIECE CONTENT (NEXTBIGBOX SIGNATURE MASTERPIECE) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-30 flex flex-col items-center justify-center text-center max-w-2xl px-4 pointer-events-auto"
          >
            {/* 1. "W I S H I N G   Y O U   A" */}
            <div
              className="text-[13px] sm:text-[15px] font-semibold tracking-[0.45em] text-[#fef08a] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] mb-2 opacity-95"
              style={{ fontFamily: "'Cinzel', 'Montserrat', serif" }}
            >
              ✦ &nbsp; W I S H I N G &nbsp; Y O U &nbsp; A &nbsp; ✦
            </div>

            {/* 2. "Happy" */}
            <h2
              className="text-4xl sm:text-6xl font-normal italic tracking-wide text-[#fff8e7] drop-shadow-[0_2px_14px_rgba(251,191,36,0.65)] -mb-3 sm:-mb-5 z-20 select-none"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Happy
            </h2>

            {/* 3. "Diwali" with Orbiting Confetti Sparkles */}
            <div className="relative flex items-center justify-center my-0 z-10">
              {/* Confetti & Sparkles */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none scale-125 z-0" viewBox="0 0 300 120">
                <circle cx="45" cy="20" r="2.5" fill="#fde047" className="animate-pulse" />
                <circle cx="85" cy="15" r="3" fill="#f43f5e" className="animate-ping" style={{ animationDuration: "3s" }} />
                <circle cx="120" cy="12" r="2" fill="#38bdf8" />
                <circle cx="160" cy="18" r="3.2" fill="#34d399" className="animate-pulse" />
                <circle cx="210" cy="22" r="2.5" fill="#f59e0b" />
                <circle cx="260" cy="30" r="3" fill="#ec4899" className="animate-pulse" />
                <circle cx="35" cy="70" r="3" fill="#a855f7" />
                <circle cx="70" cy="85" r="2" fill="#fde047" className="animate-pulse" />
                <circle cx="230" cy="85" r="2.5" fill="#38bdf8" />
                <circle cx="270" cy="75" r="3" fill="#f43f5e" className="animate-ping" style={{ animationDuration: "2.5s" }} />
                <path d="M55,42 Q58,42 58,39 Q58,42 61,42 Q58,42 58,45 Q58,42 55,42 Z" fill="#ffffff" />
                <path d="M245,35 Q248,35 248,32 Q248,35 251,35 Q248,35 248,38 Q248,35 245,35 Z" fill="#fde047" />
              </svg>

              {/* Grand Radiant Text */}
              <h1
                className="text-7xl sm:text-9xl md:text-[10rem] font-normal leading-[1.05] tracking-wide select-none"
                style={{
                  fontFamily: "'Great Vibes', cursive",
                  color: "#fde047",
                  background: "linear-gradient(180deg, #ffffff 0%, #fef08a 25%, #f59e0b 60%, #ea580c 90%, #c2410c 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 25px rgba(245, 158, 11, 0.85)) drop-shadow(0 0 55px rgba(234, 88, 12, 0.55))",
                }}
              >
                Diwali
              </h1>
            </div>

            {/* 4. GOLDEN PEDESTAL LINE WITH GLOWING 3D DIYA (NextBigBox Signature) */}
            <div className="relative flex items-center justify-center w-full max-w-md my-2 z-20">
              {/* Left Line */}
              <div className="flex-1 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/80 to-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />

              {/* Center Glowing Diya */}
              <div className="relative flex flex-col items-center mx-3 sm:mx-5">
                {/* Vibrant Flame (coral-pink to golden-white tip) */}
                <div className="relative w-12 h-20 flex items-center justify-center -mb-5 z-20">
                  <svg
                    className="w-full h-full"
                    viewBox="0 0 50 90"
                    style={{
                      transformOrigin: "50% 95%",
                      animation: "pulse 0.45s infinite alternate ease-in-out",
                      filter: "drop-shadow(0 0 16px #f59e0b) drop-shadow(0 0 35px #f97316)",
                    }}
                  >
                    <defs>
                      <linearGradient id="nbFlameGradReact" x1="50%" y1="100%" x2="50%" y2="0%">
                        <stop offset="0%" stopColor="#f43f5e" />
                        <stop offset="35%" stopColor="#f97316" />
                        <stop offset="70%" stopColor="#fde047" />
                        <stop offset="100%" stopColor="#ffffff" />
                      </linearGradient>
                      <linearGradient id="nbCoreGradReact" x1="50%" y1="100%" x2="50%" y2="0%">
                        <stop offset="0%" stopColor="#fb7185" />
                        <stop offset="50%" stopColor="#fef08a" />
                        <stop offset="100%" stopColor="#ffffff" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M25,2 C30,22 46,38 42,62 C38,76 28,84 25,84 C22,84 12,76 8,62 C4,38 20,22 25,2 Z"
                      fill="url(#nbFlameGradReact)"
                    />
                    <path
                      d="M25,22 C28,36 36,48 34,64 C32,74 27,78 25,78 C23,78 18,74 16,64 C14,48 22,36 25,22 Z"
                      fill="url(#nbCoreGradReact)"
                      opacity="0.9"
                    />
                  </svg>
                </div>

                {/* Diya Ceramic Base with Golden Rim */}
                <div className="relative z-10">
                  <svg className="w-32 sm:w-36 h-12" viewBox="0 0 160 55">
                    <defs>
                      <linearGradient id="nbBowlGradReact" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#9a3412" />
                        <stop offset="50%" stopColor="#451a03" />
                        <stop offset="100%" stopColor="#1c1917" />
                      </linearGradient>
                      <linearGradient id="nbOilGradReact" x1="0%" y1="50%" x2="100%" y2="50%">
                        <stop offset="0%" stopColor="#ea580c" />
                        <stop offset="50%" stopColor="#f43f5e" />
                        <stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M12,18 Q80,58 148,18 Q80,24 12,18 Z"
                      fill="url(#nbBowlGradReact)"
                      stroke="#f59e0b"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M18,18 Q80,38 142,18 Q80,20 18,18 Z"
                      fill="url(#nbOilGradReact)"
                      opacity="0.92"
                    />
                    <path
                      d="M15,18 Q48,32 80,14 Q112,32 145,18"
                      fill="none"
                      stroke="#fde047"
                      strokeWidth="1.8"
                    />
                    <g fill="#fde047" opacity="0.9">
                      <circle cx="45" cy="34" r="1.5" />
                      <circle cx="60" cy="38" r="1.8" />
                      <circle cx="75" cy="40" r="1.5" />
                      <circle cx="85" cy="40" r="1.5" />
                      <circle cx="100" cy="38" r="1.8" />
                      <circle cx="115" cy="34" r="1.5" />
                    </g>
                  </svg>
                </div>

                {/* Ground Glow Pool */}
                <div className="w-32 h-4 rounded-[100%] bg-amber-400/40 blur-md -mt-2" />
              </div>

              {/* Right Line */}
              <div className="flex-1 h-[1.5px] bg-gradient-to-l from-transparent via-amber-400/80 to-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            </div>

            {/* 5. Subtitle */}
            <p className="mt-4 text-[15px] sm:text-[18px] font-medium text-[#fffbeb] tracking-wider drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] max-w-lg">
              May your life shine with happiness and prosperity
            </p>

            {/* Dismiss Hint */}
            <p className="text-[11px] text-amber-200/50 tracking-widest uppercase mt-3 drop-shadow">
              Click anywhere to continue
            </p>
          </div>
        </div>
      )}
    </>
  );
}
