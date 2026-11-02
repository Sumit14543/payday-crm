import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type CelebrationStage = "idle" | "launching_rocket" | "celebrating";

export function DiwaliCelebration() {
  const [stage, setStage] = useState<CelebrationStage>("idle");
  const [countdown, setCountdown] = useState(15);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const explodeBlastRef = useRef<((x: number, y: number, count?: number) => void) | null>(null);

  const clearTimers = () => {
    if (autoCloseTimerRef.current) window.clearTimeout(autoCloseTimerRef.current);
    if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
  };

  const startSequence = () => {
    clearTimers();
    setStage("launching_rocket");

    // Blast and bloom transition after rocket reaches center (~1.35s)
    window.setTimeout(() => {
      setStage("celebrating");
      setCountdown(15);

      if (explodeBlastRef.current && canvasRef.current) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        explodeBlastRef.current(w / 2, h * 0.42, 90);
        explodeBlastRef.current(w / 2 - 40, h * 0.40, 45);
        explodeBlastRef.current(w / 2 + 40, h * 0.40, 45);
      }

      // 15-second countdown
      let timeLeft = 15;
      countdownIntervalRef.current = window.setInterval(() => {
        timeLeft -= 1;
        if (timeLeft >= 0) {
          setCountdown(timeLeft);
        }
      }, 1000);

      // 15-second auto-close
      autoCloseTimerRef.current = window.setTimeout(() => {
        handleClose();
      }, 15000);
    }, 1350);
  };

  const handleClose = () => {
    clearTimers();
    setStage("idle");
  };

  useEffect(() => {
    // Automatically trigger on page load during Diwali season
    const hasSeen = sessionStorage.getItem("diwali_wishes_artistic_v12_2026");
    if (!hasSeen) {
      startSequence();
      sessionStorage.setItem("diwali_wishes_artistic_v12_2026", "true");
    }

    return () => clearTimers();
  }, []);

  // Canvas Fireworks Simulation
  useEffect(() => {
    if (stage !== "celebrating") return;

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
      targetY: number;
      vx: number;
      vy: number;
      color: string;
      trail: { x: number; y: number }[];
    }

    const rockets: StripedRocket[] = [];
    const particles: Particle[] = [];

    const explode = (x: number, y: number, count = 50) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5.5 + 1.8;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          decay: Math.random() * 0.016 + 0.011,
          radius: Math.random() * 2.5 + 1.2,
        });
      }
    };
    explodeBlastRef.current = explode;

    let lastAutoRocket = Date.now();

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn subtle side rockets
      if (Date.now() - lastAutoRocket > 1400) {
        const isLeft = Math.random() > 0.5;
        const sx = isLeft
          ? Math.random() * (canvas.width * 0.22) + (canvas.width * 0.08)
          : Math.random() * (canvas.width * 0.22) + (canvas.width * 0.70);
        const ty = Math.random() * (canvas.height * 0.35) + 40;
        rockets.push({
          x: sx,
          y: canvas.height,
          targetY: ty,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -(Math.random() * 3 + 8),
          color: colors[Math.floor(Math.random() * colors.length)],
          trail: [],
        });
        lastAutoRocket = Date.now();
      }

      // Update rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 8) r.trail.shift();

        ctx.save();
        for (let t = 0; t < r.trail.length; t++) {
          const pt = r.trail[t];
          const a = ((t + 1) / r.trail.length) * 0.7;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(251, 191, 36, ${a})`;
          ctx.fill();
        }
        ctx.fillStyle = r.color;
        ctx.fillRect(r.x - 2, r.y - 8, 4, 12);
        ctx.restore();

        if (r.y <= r.targetY) {
          explode(r.x, r.y, 45);
          rockets.splice(i, 1);
        }
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.vx *= 0.985;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.restore();
      }

      if (isRunning) {
        animationFrameId = requestAnimationFrame(loop);
      }
    };

    loop();

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
    };
  }, [stage]);

  return (
    <>
      <style>{`
        @keyframes rocketAscent {
          0% {
            transform: translate(-50%, 100vh) scale(0.9);
            opacity: 1;
          }
          80% {
            transform: translate(-50%, 42vh) scale(1.1);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, 40vh) scale(1.2);
            opacity: 0;
          }
        }
        .animate-rocket-ascent {
          animation: rocketAscent 1.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }

        @keyframes flameFlicker {
          0%, 100% { transform: scaleY(1); opacity: 0.95; }
          50% { transform: scaleY(1.35) scaleX(0.85); opacity: 1; }
        }
        .animate-exhaust-flame {
          transform-origin: top center;
          animation: flameFlicker 0.1s infinite alternate;
        }

        @keyframes bloomEntrance {
          0% {
            opacity: 0;
            transform: scale(0.88);
          }
          50% {
            transform: scale(1.02);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-bloom-enter {
          animation: bloomEntrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* STAGE 1: LAUNCHING CARTOON RED & YELLOW ROCKET (FROM BOTTOM TO CENTER) */}
      {stage === "launching_rocket" && (
        <div className="fixed left-1/2 bottom-0 z-50 pointer-events-none animate-rocket-ascent">
          <div className="relative flex flex-col items-center">
            {/* Exact Cartoon Red & Yellow Rocket matching user reference */}
            <svg
              width="60"
              height="90"
              viewBox="0 0 60 90"
              fill="none"
              className="filter drop-shadow-[0_0_16px_#f59e0b]"
            >
              {/* Exhaust Flame */}
              <g className="animate-exhaust-flame">
                <path d="M22,68 Q30,95 30,95 Q30,95 38,68 Z" fill="#fbbf24" />
                <path d="M25,68 Q30,85 30,85 Q30,85 35,68 Z" fill="#ffffff" />
              </g>
              {/* Side Fins */}
              <path
                d="M16,52 Q6,64 8,72 Q15,70 20,62 Z"
                fill="#ef4444"
                stroke="#fde047"
                strokeWidth="2"
              />
              <path
                d="M44,52 Q54,64 52,72 Q45,70 40,62 Z"
                fill="#ef4444"
                stroke="#fde047"
                strokeWidth="2"
              />
              {/* Main Fuselage */}
              <path
                d="M30,6 C21,22 17,45 17,66 C23,68 37,68 43,66 C43,45 39,22 30,6 Z"
                fill="#ef4444"
                stroke="#fde047"
                strokeWidth="2.2"
              />
              {/* Yellow Tip */}
              <path
                d="M30,6 C26,14 24,24 23,30 C26,31 34,31 37,30 C36,24 34,14 30,6 Z"
                fill="#fde047"
              />
              {/* Cockpit Window */}
              <circle cx="30" cy="42" r="5.5" fill="#fde047" stroke="#ffffff" strokeWidth="1.8" />
            </svg>
          </div>
        </div>
      )}

      {/* STAGE 2: CELEBRATION OVERLAY (OPENS ON BLAST, AUTO-CLOSES IN 15S) */}
      {stage === "celebrating" && (
        <div
          onClick={handleClose}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/65 backdrop-blur-[3px] px-4 select-none cursor-pointer animate-in fade-in duration-500"
        >
          {/* Canvas for Fireworks */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 w-full h-full pointer-events-none"
          />

          {/* Close button top right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            className="absolute top-6 right-6 z-40 rounded-full border border-amber-400/40 bg-black/40 p-2 text-amber-200 hover:bg-black/70 hover:text-white transition cursor-pointer backdrop-blur-sm"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* 15s Countdown Indicator Top Left */}
          <div className="absolute top-6 left-6 z-40 flex items-center gap-2 px-3 py-1 rounded-full bg-black/50 border border-amber-500/30 text-[11px] text-amber-300 backdrop-blur-sm pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{countdown}s</span>
          </div>

          {/* HANGING LAMPS ON THREADS */}
          <div className="absolute top-0 inset-x-0 h-48 pointer-events-none z-20 flex justify-between px-6 sm:px-14">
            {/* Left Flank */}
            <div className="flex gap-8 sm:gap-14">
              <div className="flex flex-col items-center" style={{ height: "135px" }}>
                <div className="w-[1.2px] h-26 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-3.5 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_12px_#f59e0b] animate-pulse" />
                  <div className="h-2.5 w-7 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
              <div className="flex flex-col items-center hidden sm:flex" style={{ height: "185px" }}>
                <div className="w-[1.2px] h-38 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-4 w-2.5 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_14px_#f59e0b] animate-pulse" />
                  <div className="h-3 w-8 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
            </div>

            {/* Right Flank */}
            <div className="flex gap-8 sm:gap-14">
              <div className="flex flex-col items-center hidden sm:flex" style={{ height: "165px" }}>
                <div className="w-[1.2px] h-32 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-4 w-2.5 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_14px_#f59e0b] animate-pulse" />
                  <div className="h-3 w-8 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
              <div className="flex flex-col items-center" style={{ height: "140px" }}>
                <div className="w-[1.2px] h-28 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-3.5 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_12px_#f59e0b] animate-pulse" />
                  <div className="h-2.5 w-7 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
            </div>
          </div>

          {/* MAIN CENTERPIECE */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-30 flex flex-col items-center justify-center text-center w-full max-w-4xl px-2 pointer-events-auto overflow-visible animate-bloom-enter"
          >
            {/* Rotating Lace Mandala Ring */}
            <div
              className="absolute -top-12 w-[420px] sm:w-[500px] h-[420px] sm:h-[500px] pointer-events-none opacity-65"
              style={{ animation: "spin 55s linear infinite" }}
            >
              <svg viewBox="0 0 400 400" className="w-full h-full stroke-amber-400 fill-none" strokeWidth="1.5">
                <g transform="translate(200,200)">
                  <circle cx="0" cy="0" r="175" strokeDasharray="3,6" />
                  <circle cx="0" cy="0" r="150" />
                  <circle cx="0" cy="0" r="125" strokeDasharray="2,4" />
                  <circle cx="0" cy="0" r="100" />
                  <circle cx="0" cy="0" r="75" />
                  <g>
                    {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5].map((deg) => (
                      <path
                        key={deg}
                        d="M0,-75 Q-20,-115 0,-150 Q20,-115 0,-75"
                        transform={`rotate(${deg})`}
                      />
                    ))}
                  </g>
                </g>
              </svg>
            </div>

            {/* Ambient Warm Glow Pool */}
            <div className="absolute -bottom-8 w-80 h-44 bg-gradient-to-t from-yellow-500/25 via-amber-500/15 to-transparent rounded-full blur-3xl pointer-events-none" />

            {/* TEXT SECTION (CLEAN BRUSH CALLIGRAPHY - EXACT IMAGE 2) */}
            <div className="relative z-30 mb-2 flex flex-col items-center">
              {/* 'Happy' in Crimson Brush Script */}
              <h2
                className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-wide text-[#dc2626] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] mb-0 select-none"
                style={{ fontFamily: "'Marck Script', 'Caveat', cursive" }}
              >
                Happy
              </h2>

              {/* 'Diwali' in Saffron-Orange Indian Brush Calligraphy (100% visible, no clipping) */}
              <h1
                className="text-6xl sm:text-8xl md:text-[8.5rem] font-bold leading-normal select-none tracking-normal whitespace-nowrap px-6 py-2 overflow-visible"
                style={{
                  fontFamily: "'Kaushan Script', cursive",
                  color: "#ea580c",
                  background: "linear-gradient(180deg, #fef08a 0%, #fbbf24 25%, #f97316 65%, #ea580c 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 4px 10px rgba(0, 0, 0, 0.75)) drop-shadow(0 0 16px rgba(234, 88, 12, 0.35))",
                }}
              >
                Diwali
              </h1>
            </div>

            {/* THE ARTISTIC 3D DIYA */}
            <div className="relative z-30 flex flex-col items-center -mt-2">
              {/* Vibrant Flame */}
              <div className="relative w-16 h-28 flex items-center justify-center -mb-8 z-20">
                <svg
                  className="w-full h-full"
                  viewBox="0 0 50 90"
                  style={{
                    transformOrigin: "50% 95%",
                    animation: "pulse 0.45s infinite alternate ease-in-out",
                    filter: "drop-shadow(0 0 16px #f59e0b) drop-shadow(0 0 35px #ef4444)",
                  }}
                >
                  <defs>
                    <linearGradient id="flameGradReact" x1="50%" y1="100%" x2="50%" y2="0%">
                      <stop offset="0%" stopColor="#f43f5e" />
                      <stop offset="35%" stopColor="#f97316" />
                      <stop offset="75%" stopColor="#fde047" />
                      <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>
                    <linearGradient id="flameCoreReact" x1="50%" y1="100%" x2="50%" y2="0%">
                      <stop offset="0%" stopColor="#fb7185" />
                      <stop offset="50%" stopColor="#fef08a" />
                      <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M25,2 C30,22 46,38 42,62 C38,76 28,84 25,84 C22,84 12,76 8,62 C4,38 20,22 25,2 Z"
                    fill="url(#flameGradReact)"
                  />
                  <path
                    d="M25,22 C28,36 36,48 34,64 C32,74 27,78 25,78 C23,78 18,74 16,64 C14,48 22,36 25,22 Z"
                    fill="url(#flameCoreReact)"
                    opacity="0.85"
                  />
                </svg>
              </div>

              {/* Diya Clay Bowl with Dual Petal Rim & Stars */}
              <div className="relative z-10 scale-110 sm:scale-125">
                <svg className="w-52 h-18" viewBox="0 0 160 55">
                  <defs>
                    <linearGradient id="diyaBowlGradReact" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7c2d12" />
                      <stop offset="50%" stopColor="#451a03" />
                      <stop offset="100%" stopColor="#1e1026" />
                    </linearGradient>
                    <linearGradient id="rimGoldenReact" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="50%" stopColor="#fed7aa" />
                      <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                    <linearGradient id="oilPoolGradReact" x1="0%" y1="50%" x2="100%" y2="50%">
                      <stop offset="0%" stopColor="#ea580c" />
                      <stop offset="50%" stopColor="#f43f5e" />
                      <stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M10,18 Q80,56 150,18 Q80,24 10,18 Z"
                    fill="url(#diyaBowlGradReact)"
                    stroke="url(#rimGoldenReact)"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M16,18 Q80,36 144,18 Q80,20 16,18 Z"
                    fill="url(#oilPoolGradReact)"
                    opacity="0.92"
                  />
                  <path
                    d="M14,18 Q48,32 80,13 Q112,32 146,18"
                    fill="none"
                    stroke="#fde047"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M80,13 L80,34"
                    stroke="#fde047"
                    strokeWidth="1.2"
                    strokeDasharray="1,2"
                    opacity="0.7"
                  />
                  <g fill="#fde047" opacity="0.9">
                    <circle cx="42" cy="33" r="1.6" />
                    <circle cx="58" cy="37" r="1.9" />
                    <circle cx="74" cy="39" r="1.6" />
                    <circle cx="86" cy="39" r="1.6" />
                    <circle cx="102" cy="37" r="1.9" />
                    <circle cx="118" cy="33" r="1.6" />
                  </g>
                </svg>
              </div>

              {/* Ground Shadow & Light Pool */}
              <div className="w-48 h-5 rounded-[100%] bg-black/70 blur-xs -mt-1.5" />
              <div className="w-68 h-9 rounded-[100%] bg-amber-400/30 blur-md -mt-4 pointer-events-none" />
            </div>

            {/* Clean Subtitle */}
            <p className="mt-5 text-[15px] sm:text-[17px] font-semibold text-[#fff8e7] tracking-wider drop-shadow-[0_2px_14px_rgba(0,0,0,0.98)]">
              ✨ May your life shine with happiness and prosperity ✨
            </p>

            {/* Dismiss Hint */}
            <p className="text-[11px] text-amber-200/50 tracking-widest uppercase mt-3 drop-shadow">
              Auto-closes in {countdown}s • Click anywhere to dismiss
            </p>
          </div>
        </div>
      )}

      {/* Floating Badge Bottom Right to Replay Animation */}
      <button
        type="button"
        onClick={startSequence}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-amber-400/40 bg-black/70 px-3.5 py-1.5 text-xs font-semibold text-amber-300 shadow-xl backdrop-blur-md hover:bg-black/90 hover:scale-105 active:scale-95 transition cursor-pointer"
        title="Play Diwali Wishes"
      >
        <span className="text-base animate-bounce" style={{ animationDuration: "2s" }}>
          🚀
        </span>
        <span className="tracking-wider uppercase font-serif">Happy Diwali</span>
      </button>
    </>
  );
}
