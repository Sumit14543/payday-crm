import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function DiwaliCelebration() {
  const [isActive, setIsActive] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const periodicFireworksRef = useRef<number | null>(null);
  const createFireworkRef = useRef<((x: number, y: number, count?: number) => void) | null>(null);

  const clearTimers = () => {
    if (autoCloseTimerRef.current) window.clearTimeout(autoCloseTimerRef.current);
    if (periodicFireworksRef.current) window.clearInterval(periodicFireworksRef.current);
  };

  const closeCelebration = () => {
    clearTimers();
    setIsFadingOut(true);
    window.setTimeout(() => {
      setIsActive(false);
      setIsFadingOut(false);
    }, 800);
  };

  const startAnimation = () => {
    clearTimers();
    setIsFadingOut(false);
    setIsActive(true);

    // Initial bursts: Center burst at 1.25s when rocket reaches 36vh
    window.setTimeout(() => {
      if (createFireworkRef.current) {
        createFireworkRef.current(window.innerWidth / 2, window.innerHeight * 0.36, 120);
      }
    }, 1250);

    // Secondary flanking bursts at 1.8s
    window.setTimeout(() => {
      if (createFireworkRef.current) {
        createFireworkRef.current(window.innerWidth * 0.30, window.innerHeight * 0.30, 60);
        createFireworkRef.current(window.innerWidth * 0.70, window.innerHeight * 0.32, 60);
      }
    }, 1800);

    // Continuous festive ambient fireworks while visible
    periodicFireworksRef.current = window.setInterval(() => {
      if (createFireworkRef.current) {
        const rx = Math.random() * (window.innerWidth * 0.7) + (window.innerWidth * 0.15);
        const ry = Math.random() * (window.innerHeight * 0.35) + 50;
        createFireworkRef.current(rx, ry, Math.floor(Math.random() * 30) + 35);
      }
    }, 3200);

    // Exact 6 MINUTES auto-dismiss (360,000 ms)
    autoCloseTimerRef.current = window.setTimeout(() => {
      closeCelebration();
    }, 360000);
  };

  useEffect(() => {
    // Automatically trigger on page load during Diwali season
    const hasSeen = sessionStorage.getItem("diwali_wishes_artistic_v14_2026");
    if (!hasSeen) {
      startAnimation();
      sessionStorage.setItem("diwali_wishes_artistic_v14_2026", "true");
    }

    return () => clearTimers();
  }, []);

  // Canvas Fireworks Simulation
  useEffect(() => {
    if (!isActive) return;

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
      "#ffd166", "#ff9f1c", "#ff4d6d", "#ffffff", "#ffcc33", "#ec4899", "#38bdf8"
    ];

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      alpha: number;
      radius: number;
    }

    let particles: Particle[] = [];

    const createFirework = (x: number, y: number, count = 100) => {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const speed = Math.random() * 5.5 + 2;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          radius: Math.random() * 2.5 + 1.2,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };
    createFireworkRef.current = createFirework;

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.04; // gravity
        particle.alpha -= 0.012;

        ctx.globalAlpha = Math.max(particle.alpha, 0);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = particle.color;
        ctx.fill();
      });

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      particles = particles.filter((particle) => particle.alpha > 0);

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
  }, [isActive]);

  return (
    <>
      <style>{`
        /* Rocket Launch */
        @keyframes diwaliRocketLaunch {
          0% {
            transform: translate3d(-50%, 110vh, 0) scale(0.65);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translate3d(-50%, 36vh, 0) scale(1.05);
            opacity: 0;
          }
        }
        .animate-diwali-rocket {
          position: absolute;
          left: 50%;
          top: 0;
          width: 60px;
          height: 100px;
          opacity: 0;
          z-index: 20;
          will-change: transform, opacity;
          animation: diwaliRocketLaunch 1.25s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
        }

        /* Rocket Flame */
        @keyframes rocketFlamePulse {
          from { transform: scaleY(0.85) scaleX(0.95); opacity: 0.9; }
          to { transform: scaleY(1.35) scaleX(1.05); opacity: 1; }
        }
        .animate-rocket-flame {
          transform-origin: top center;
          animation: rocketFlamePulse 0.12s infinite alternate;
        }

        /* Grand Bloom Entrance */
        @keyframes grandBloomEntrance {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.65);
            filter: blur(8px);
          }
          70% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.04);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
            filter: blur(0);
          }
        }
        .animate-grand-bloom {
          position: absolute;
          left: 50%;
          top: 45%;
          width: min(92%, 840px);
          transform: translate(-50%, -50%);
          opacity: 0;
          animation: grandBloomEntrance 0.9s cubic-bezier(0.18, 0.89, 0.32, 1.2) forwards;
          animation-delay: 1.35s;
        }

        /* Diya Flame Realistic Flickering */
        @keyframes flameDance {
          0%, 100% {
            transform: scale(1) rotate(-1deg);
            filter: drop-shadow(0 0 16px #f59e0b) drop-shadow(0 0 32px #ef4444);
          }
          35% {
            transform: scale(1.08, 0.95) rotate(1.5deg);
            filter: drop-shadow(0 0 22px #fbbf24) drop-shadow(0 0 42px #f97316);
          }
          70% {
            transform: scale(0.95, 1.05) rotate(-1.5deg);
            filter: drop-shadow(0 0 16px #f59e0b) drop-shadow(0 0 28px #dc2626);
          }
        }
        .animate-vibrant-flame {
          transform-origin: 50% 95%;
          animation: flameDance 0.35s infinite alternate ease-in-out;
        }

        /* Rotating Lace Mandala */
        @keyframes spinMandala {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-mandala {
          animation: spinMandala 55s linear infinite;
        }

        /* Hanging Lamps Gentle Sway */
        @keyframes swayLamp {
          0%, 100% { transform: rotate(-2.5deg); }
          50% { transform: rotate(2.5deg); }
        }
        .animate-sway-left {
          transform-origin: top center;
          animation: swayLamp 4s ease-in-out infinite;
        }
        .animate-sway-right {
          transform-origin: top center;
          animation: swayLamp 4.8s ease-in-out infinite reverse;
        }

        /* Fade Out */
        .animate-diwali-fadeout {
          opacity: 0 !important;
          transition: opacity 0.8s ease;
        }
      `}</style>

      {/* FULL BESPOKE CELEBRATION OVERLAY */}
      {isActive && (
        <div
          onClick={closeCelebration}
          className={`fixed inset-0 z-50 overflow-hidden cursor-pointer select-none ${
            isFadingOut ? "animate-diwali-fadeout" : ""
          }`}
          style={{ background: "rgba(8, 6, 18, 0.76)" }}
        >
          {/* Close button top right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeCelebration();
            }}
            className="absolute top-6 right-6 z-50 rounded-full border border-amber-400/30 bg-black/50 p-2.5 text-amber-200 hover:bg-black/80 hover:text-white transition cursor-pointer backdrop-blur-sm"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Fireworks Canvas */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* 1. Cartoon Red & Yellow Rocket Launch */}
          <div className="animate-diwali-rocket pointer-events-none">
            <svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full overflow-visible filter drop-shadow-[0_0_15px_#f59e0b]">
              <path
                d="M30 5 C12 20 15 45 15 65 L45 65 C45 45 48 20 30 5Z"
                fill="#ff3158"
                stroke="#ffd166"
                strokeWidth="2"
              />
              <circle cx="30" cy="35" r="7" fill="#fff4c2" stroke="#ffb703" strokeWidth="2" />
              <path d="M15 55 L3 75 L15 70 Z" fill="#ffb703" />
              <path d="M45 55 L57 75 L45 70 Z" fill="#ffb703" />
              <path d="M15 65 L45 65 L30 80 Z" fill="#ff3158" />
              <path
                className="animate-rocket-flame"
                d="M22 75 Q30 102 38 75 Q30 86 22 75Z"
                fill="#ffb703"
              />
            </svg>
          </div>

          {/* 2. Flanked Hanging Lamps on Threads */}
          <div className="absolute top-0 inset-x-0 h-48 pointer-events-none z-10 flex justify-between px-6 sm:px-14">
            {/* Left Flank */}
            <div className="flex gap-8 sm:gap-14">
              <div className="flex flex-col items-center animate-sway-left" style={{ height: "135px" }}>
                <div className="w-[1.2px] h-26 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-3.5 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_12px_#f59e0b] animate-pulse" />
                  <div className="h-2.5 w-7 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
              <div className="flex flex-col items-center hidden sm:flex animate-sway-right" style={{ height: "185px" }}>
                <div className="w-[1.2px] h-38 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-4 w-2.5 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_14px_#f59e0b] animate-pulse" />
                  <div className="h-3 w-8 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
            </div>

            {/* Right Flank */}
            <div className="flex gap-8 sm:gap-14">
              <div className="flex flex-col items-center hidden sm:flex animate-sway-left" style={{ height: "165px" }}>
                <div className="w-[1.2px] h-32 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-4 w-2.5 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_14px_#f59e0b] animate-pulse" />
                  <div className="h-3 w-8 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
              <div className="flex flex-col items-center animate-sway-right" style={{ height: "140px" }}>
                <div className="w-[1.2px] h-28 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-3.5 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_12px_#f59e0b] animate-pulse" />
                  <div className="h-2.5 w-7 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Bespoke Handcrafted Centerpiece */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-grand-bloom pointer-events-auto flex flex-col items-center justify-center text-center px-4"
          >
            {/* Rotating Lace Mandala Ring */}
            <div
              className="absolute -top-14 w-[420px] sm:w-[520px] h-[420px] sm:h-[520px] pointer-events-none opacity-45 animate-spin-mandala"
            >
              <svg viewBox="0 0 400 400" className="w-full h-full stroke-amber-400/90 fill-none" strokeWidth="1.3">
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

            {/* Ambient Warm Backlight Glow */}
            <div className="absolute -bottom-8 w-88 h-44 bg-gradient-to-t from-yellow-500/25 via-amber-500/15 to-transparent rounded-full blur-3xl pointer-events-none" />

            {/* 1. "W I S H I N G   Y O U   A" */}
            <div
              className="text-[12px] sm:text-[14px] font-semibold tracking-[0.45em] text-[#fed7aa] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] mb-1 opacity-95"
              style={{ fontFamily: "'Cinzel', 'Montserrat', serif" }}
            >
              ✦ &nbsp; W I S H I N G &nbsp; Y O U &nbsp; A &nbsp; ✦
            </div>

            {/* 2. "Happy" in Flowing Crimson Red Brush Script */}
            <h2
              className="text-4xl sm:text-6xl font-normal tracking-wide text-[#f43f5e] drop-shadow-[0_2px_10px_rgba(244,63,94,0.6)] -mb-2 sm:-mb-3 select-none"
              style={{ fontFamily: "'Marck Script', cursive" }}
            >
              Happy
            </h2>

            {/* 3. "Diwali" in Radiant Saffron-Gold Festive Calligraphy */}
            <h1
              className="text-7xl sm:text-9xl md:text-[9.2rem] font-bold leading-[1.02] tracking-wide select-none whitespace-nowrap px-6"
              style={{
                fontFamily: "'Kaushan Script', cursive",
                color: "#fde047",
                background: "linear-gradient(180deg, #ffffff 0%, #fef08a 25%, #f59e0b 60%, #ea580c 90%, #c2410c 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 22px rgba(245, 158, 11, 0.75)) drop-shadow(0 0 45px rgba(234, 88, 12, 0.45))",
              }}
            >
              Diwali
            </h1>

            {/* 4. HANDCRAFTED 3D DIYA ON SLEEK GOLDEN PEDESTAL LINE */}
            <div className="relative flex items-center justify-center w-full max-w-lg mt-1 mb-2 z-20">
              {/* Left Line */}
              <div className="flex-1 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/80 to-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />

              {/* Center Glowing 3D Diya */}
              <div className="relative flex flex-col items-center mx-3 sm:mx-6">
                {/* Flame */}
                <div className="relative w-14 h-24 flex items-center justify-center -mb-6 z-20">
                  <svg className="w-full h-full animate-vibrant-flame" viewBox="0 0 50 90">
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
                      opacity="0.88"
                    />
                  </svg>
                </div>

                {/* Ceramic Bowl */}
                <div className="relative z-10 scale-105 sm:scale-115">
                  <svg className="w-40 sm:w-44 h-14" viewBox="0 0 160 55">
                    <defs>
                      <linearGradient id="nbBowlGradReact" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#7c2d12" />
                        <stop offset="50%" stopColor="#451a03" />
                        <stop offset="100%" stopColor="#1e1026" />
                      </linearGradient>
                      <linearGradient id="nbOilGradReact" x1="0%" y1="50%" x2="100%" y2="50%">
                        <stop offset="0%" stopColor="#ea580c" />
                        <stop offset="50%" stopColor="#f43f5e" />
                        <stop offset="100%" stopColor="#ea580c" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M10,18 Q80,56 150,18 Q80,24 10,18 Z"
                      fill="url(#nbBowlGradReact)"
                      stroke="#f59e0b"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M16,18 Q80,36 144,18 Q80,20 16,18 Z"
                      fill="url(#nbOilGradReact)"
                      opacity="0.92"
                    />
                    <path
                      d="M14,18 Q48,32 80,13 Q112,32 146,18"
                      fill="none"
                      stroke="#fde047"
                      strokeWidth="1.8"
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

                {/* Ground Light */}
                <div className="w-36 h-4 rounded-[100%] bg-amber-400/40 blur-md -mt-2" />
              </div>

              {/* Right Line */}
              <div className="flex-1 h-[1.5px] bg-gradient-to-l from-transparent via-amber-400/80 to-amber-200 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
            </div>

            {/* 5. Subtitle */}
            <p className="mt-2 text-base sm:text-lg font-medium text-[#fffbeb] tracking-wider drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] max-w-lg">
              May your life shine with happiness and prosperity
            </p>
          </div>
        </div>
      )}

      {/* Replay Trigger Badge Bottom Right */}
      <button
        type="button"
        onClick={startAnimation}
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
