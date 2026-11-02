import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export function DiwaliCelebration() {
  const [isOpen, setIsOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Automatically trigger on page load during Diwali season
    const hasSeen = sessionStorage.getItem("diwali_wishes_artistic_v7_2026");
    if (!hasSeen) {
      setIsOpen(true);
      sessionStorage.setItem("diwali_wishes_artistic_v7_2026", "true");
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
      // Launch strictly on left (8% to 32%) or right (68% to 92%) so center text is unobstructed
      const isLeft = Math.random() > 0.5;
      const sx = customStartX !== undefined
        ? customStartX
        : isLeft
          ? Math.random() * (canvas.width * 0.24) + (canvas.width * 0.08)
          : Math.random() * (canvas.width * 0.24) + (canvas.width * 0.68);
      const tx = sx + (Math.random() - 0.5) * 80;
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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/35 backdrop-blur-[5px] px-4 select-none cursor-pointer animate-in fade-in duration-300"
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

          {/* HANGING LAMPS ON THREADS (Flanked on outer sides so they frame the screen and NEVER overlap the center text!) */}
          <div className="absolute top-0 inset-x-0 h-48 pointer-events-none z-20 flex justify-between px-6 sm:px-14">
            {/* Left Flank Group */}
            <div className="flex gap-8 sm:gap-14">
              {/* Lamp 1 (Outer Left) */}
              <div className="flex flex-col items-center" style={{ height: "135px" }}>
                <div className="w-[1.2px] h-26 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-3.5 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_12px_#f59e0b] animate-pulse" />
                  <div className="h-2.5 w-7 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>

              {/* Lamp 2 (Inner Left) */}
              <div className="flex flex-col items-center hidden sm:flex" style={{ height: "185px" }}>
                <div className="w-[1.2px] h-38 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-4 w-2.5 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_14px_#f59e0b] animate-pulse" />
                  <div className="h-3 w-8 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
            </div>

            {/* Right Flank Group */}
            <div className="flex gap-8 sm:gap-14">
              {/* Lamp 3 (Inner Right) */}
              <div className="flex flex-col items-center hidden sm:flex" style={{ height: "175px" }}>
                <div className="w-[1.2px] h-34 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-4 w-2.5 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_14px_#f59e0b] animate-pulse" />
                  <div className="h-3 w-8 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>

              {/* Lamp 4 (Outer Right) */}
              <div className="flex flex-col items-center" style={{ height: "125px" }}>
                <div className="w-[1.2px] h-22 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
                <div className="flex flex-col items-center -mt-1">
                  <div className="h-3.5 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_12px_#f59e0b] animate-pulse" />
                  <div className="h-2.5 w-7 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
                </div>
              </div>
            </div>
          </div>

          {/* MAIN CENTERPIECE: Rotating Mandala + User Image 2 Brush Text + Image 1 Vibrant Diya */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-30 flex flex-col items-center justify-center text-center max-w-xl px-4 pointer-events-auto"
          >
            {/* Rotating Lace Mandala Ring (From Image 2) */}
            <div
              className="absolute -top-12 w-[420px] sm:w-[500px] h-[420px] sm:h-[500px] pointer-events-none opacity-25"
              style={{ animation: "spin 55s linear infinite" }}
            >
              <svg viewBox="0 0 400 400" className="w-full h-full stroke-amber-200 fill-none" strokeWidth="1.2">
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

            {/* Bokeh Light Orbs (From Image 1) */}
            <div className="absolute -top-6 left-1/4 w-8 h-8 rounded-full bg-yellow-300/35 blur-xs pointer-events-none animate-pulse" />
            <div className="absolute top-12 right-1/4 w-10 h-10 rounded-full bg-amber-400/30 blur-xs pointer-events-none animate-pulse" style={{ animationDelay: "1s" }} />
            <div className="absolute bottom-16 right-1/3 w-6 h-6 rounded-full bg-yellow-400/35 blur-xs pointer-events-none animate-pulse" style={{ animationDelay: "2s" }} />

            {/* TEXT SECTION (Refined Spacing: Happy elevated gracefully above Diwali) */}
            <div className="relative z-30 mb-3 flex flex-col items-center">
              {/* 'Happy' in Crimson/Red Brush Script (Image 2) */}
              <h2
                className="text-4xl sm:text-6xl font-bold tracking-wide text-[#dc2626] drop-shadow-[0_2px_4px_rgba(255,255,255,0.7)] drop-shadow-[0_4px_16px_rgba(220,38,38,0.85)] mb-1 select-none"
                style={{ fontFamily: "'Caveat', 'Brush Script MT', cursive" }}
              >
                Happy
              </h2>

              {/* 'Diwali' in Saffron-Orange Textured Calligraphy Brush (Image 2) */}
              <h1
                className="text-7xl sm:text-9xl md:text-[9.8rem] font-bold leading-[0.92] select-none tracking-normal"
                style={{
                  fontFamily: "'Great Vibes', 'Dancing Script', cursive",
                  color: "#f97316",
                  background: "linear-gradient(180deg, #ea580c 0%, #f97316 45%, #fbbf24 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 2px 3px #fff8e7) drop-shadow(0 0 18px rgba(249,115,22,0.95)) drop-shadow(0 0 40px rgba(234,88,12,0.6))",
                }}
              >
                Diwali
              </h1>
            </div>

            {/* THE ARTISTIC 3D DIYA (Seamless Connection: Flame resting directly inside lamp bowl) */}
            <div className="relative z-30 flex flex-col items-center -mt-2">
              
              {/* Vibrant Flame: Hot Coral Pink Base to Fiery Orange to Golden-White Tip (Image 1) */}
              <div className="relative w-18 h-30 flex items-center justify-center -mb-9 z-20">
                <svg
                  className="w-full h-full"
                  viewBox="0 0 50 90"
                  style={{
                    transformOrigin: "50% 92%",
                    animation: "pulse 0.5s infinite alternate ease-in-out",
                    filter: "drop-shadow(0 0 16px #f59e0b) drop-shadow(0 0 35px #ef4444)",
                  }}
                >
                  <defs>
                    <linearGradient id="vibrantFlameGradReact" x1="50%" y1="100%" x2="50%" y2="0%">
                      <stop offset="0%" stopColor="#f43f5e" />
                      <stop offset="35%" stopColor="#f97316" />
                      <stop offset="75%" stopColor="#fde047" />
                      <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>
                    <linearGradient id="innerFlameCoreReact" x1="50%" y1="100%" x2="50%" y2="0%">
                      <stop offset="0%" stopColor="#fb7185" />
                      <stop offset="50%" stopColor="#fef08a" />
                      <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>
                  </defs>

                  <path
                    d="M25,2 C30,22 46,38 42,62 C38,76 28,84 25,84 C22,84 12,76 8,62 C4,38 20,22 25,2 Z"
                    fill="url(#vibrantFlameGradReact)"
                  />
                  <path
                    d="M25,22 C28,36 36,48 34,64 C32,74 27,78 25,78 C23,78 18,74 16,64 C14,48 22,36 25,22 Z"
                    fill="url(#innerFlameCoreReact)"
                    opacity="0.88"
                  />
                </svg>
              </div>

              {/* Diya Clay Bowl with Dual Petal Rim & Stars (Image 1 & 2 - seamlessly aligned with flame) */}
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

                  {/* Main Ceramic Bowl */}
                  <path
                    d="M10,18 Q80,56 150,18 Q80,24 10,18 Z"
                    fill="url(#diyaBowlGradReact)"
                    stroke="url(#rimGoldenReact)"
                    strokeWidth="1.6"
                  />
                  
                  {/* Glowing Oil Pool */}
                  <path
                    d="M16,18 Q80,36 144,18 Q80,20 16,18 Z"
                    fill="url(#oilPoolGradReact)"
                    opacity="0.92"
                  />

                  {/* Dual Petal Center Arch on Rim (From Image 2) */}
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

                  {/* Decorative Stars on Lamp Body (From Image 1) */}
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

            {/* Clean Subtitle: 100% Readable with framing sparkles */}
            <p className="mt-5 text-[15px] sm:text-[17px] font-semibold text-[#fff8e7] tracking-wider drop-shadow-[0_2px_14px_rgba(0,0,0,0.98)]">
              ✨ May your life shine with happiness and prosperity ✨
            </p>

            {/* Subtle Click to Dismiss Hint */}
            <p className="text-[11px] text-amber-200/50 tracking-widest uppercase mt-3 drop-shadow">
              Click anywhere to continue
            </p>
          </div>
        </div>
      )}
    </>
  );
}
