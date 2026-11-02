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

    // Initial bursts: Center burst at 1.2s when rocket reaches 35vh
    window.setTimeout(() => {
      if (createFireworkRef.current) {
        createFireworkRef.current(window.innerWidth / 2, window.innerHeight * 0.35, 120);
      }
    }, 1200);

    // Secondary flanking bursts at 1.8s
    window.setTimeout(() => {
      if (createFireworkRef.current) {
        createFireworkRef.current(window.innerWidth * 0.32, window.innerHeight * 0.30, 60);
        createFireworkRef.current(window.innerWidth * 0.68, window.innerHeight * 0.32, 60);
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
    const hasSeen = sessionStorage.getItem("diwali_wishes_artistic_v13_2026");
    if (!hasSeen) {
      startAnimation();
      sessionStorage.setItem("diwali_wishes_artistic_v13_2026", "true");
    }

    return () => clearTimers();
  }, []);

  // Canvas Fireworks Simulation (Exact NextBigBox logic)
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
        /* NextBigBox Exact Rocket Launch */
        @keyframes diwaliRocketLaunch {
          0% {
            transform: translate3d(-50%, 110vh, 0) scale(0.6);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translate3d(-50%, 35vh, 0) scale(1);
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
          z-index: 2;
          will-change: transform, opacity;
          animation: diwaliRocketLaunch 1.2s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
        }

        /* NextBigBox Rocket Flame */
        @keyframes diwaliFlame {
          from { transform: scaleY(0.8); }
          to { transform: scaleY(1.3); }
        }
        .animate-diwali-flame {
          transform-origin: center;
          animation: diwaliFlame 0.15s infinite alternate;
        }

        /* NextBigBox Greeting Appearance */
        @keyframes diwaliGreetingAppear {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
            filter: blur(10px);
          }
          70% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1.08);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
            filter: blur(0);
          }
        }
        .animate-diwali-greeting {
          position: absolute;
          left: 50%;
          top: 42%;
          width: min(90%, 700px);
          transform: translate(-50%, -50%) scale(0.5);
          text-align: center;
          opacity: 0;
          z-index: 3;
          color: #fff3c4;
          animation: diwaliGreetingAppear 1s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
          animation-delay: 1.4s;
          text-shadow:
            0 0 10px rgba(255, 190, 50, 0.6),
            0 0 30px rgba(255, 120, 20, 0.4);
        }

        /* NextBigBox Typography */
        .diwali-small-text {
          display: block;
          font-size: clamp(14px, 2vw, 22px);
          letter-spacing: 5px;
          text-transform: uppercase;
          color: #ffe8a3;
          margin-bottom: 8px;
        }
        .happy-text {
          display: block;
          font-family: Georgia, serif;
          font-size: clamp(30px, 5vw, 55px);
          font-weight: 400;
          color: #fff1b3;
          letter-spacing: 3px;
        }
        .diwali-text {
          display: block;
          font-family: "Brush Script MT", "Segoe Script", cursive;
          font-size: clamp(65px, 12vw, 130px);
          font-weight: 700;
          font-style: italic;
          line-height: 1.1;
          background: linear-gradient(180deg,
              #fff7c2 0%,
              #ffd76a 35%,
              #ff9b22 65%,
              #fff0a3 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 0 15px rgba(255, 174, 0, 0.5));
        }
        .diwali-decoration {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
          margin: 15px auto;
        }
        .diwali-decoration span:not(.diya-icon) {
          width: 70px;
          height: 1px;
          background: linear-gradient(90deg, transparent, #ffd166, transparent);
        }
        .diya-icon {
          font-size: 30px;
          filter: drop-shadow(0 0 10px rgba(255, 180, 0, 0.8));
        }

        /* Fade Out */
        .animate-diwali-fadeout {
          opacity: 0 !important;
          transition: opacity 0.8s ease;
        }
      `}</style>

      {/* FULL OVERLAY (EXACT NEXTBIGBOX IMPLEMENTATION) */}
      {isActive && (
        <div
          onClick={closeCelebration}
          className={`fixed inset-0 z-50 overflow-hidden cursor-pointer select-none ${
            isFadingOut ? "animate-diwali-fadeout" : ""
          }`}
          style={{ background: "rgba(0, 0, 0, 0.773)" }}
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

          {/* Exact NextBigBox Cartoon Rocket */}
          <div className="animate-diwali-rocket pointer-events-none">
            <svg viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" className="w-full h-full overflow-visible">
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
                className="animate-diwali-flame"
                d="M22 75 Q30 100 38 75 Q30 85 22 75Z"
                fill="#ffb703"
              />
            </svg>
          </div>

          {/* Exact NextBigBox Diwali Greeting */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-diwali-greeting pointer-events-auto"
          >
            <span className="diwali-small-text">Wishing You A</span>

            <h1 className="m-0 p-0 leading-none">
              <span className="happy-text">Happy</span>
              <span className="diwali-text">Diwali</span>
            </h1>

            <div className="diwali-decoration">
              <span />
              <span className="diya-icon">🪔</span>
              <span />
            </div>

            <p className="m-0 mt-3 text-base sm:text-lg tracking-wider text-[#fff2d0]">
              May your life shine with happiness and prosperity
            </p>
          </div>
        </div>
      )}

      {/* Floating Replay Badge Bottom Right */}
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
