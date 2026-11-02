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

          {/* HANGING LAMPS ON THREADS (From User Image 2) */}
          <div className="absolute top-0 inset-x-0 h-48 pointer-events-none z-20 flex justify-between px-6 sm:px-24">
            {/* Lamp 1 */}
            <div className="flex flex-col items-center" style={{ height: "130px" }}>
              <div className="w-[1px] h-24 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
              <div className="flex flex-col items-center -mt-1">
                <div className="h-3 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_10px_#f59e0b] animate-pulse" />
                <div className="h-2 w-6 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
              </div>
            </div>

            {/* Lamp 2 */}
            <div className="flex flex-col items-center hidden sm:flex" style={{ height: "170px" }}>
              <div className="w-[1px] h-32 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
              <div className="flex flex-col items-center -mt-1">
                <div className="h-3.5 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_12px_#f59e0b] animate-pulse" />
                <div className="h-2.5 w-7 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
              </div>
            </div>

            {/* Lamp 3 */}
            <div className="flex flex-col items-center hidden sm:flex" style={{ height: "155px" }}>
              <div className="w-[1px] h-28 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
              <div className="flex flex-col items-center -mt-1">
                <div className="h-3.5 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_12px_#f59e0b] animate-pulse" />
                <div className="h-2.5 w-7 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
              </div>
            </div>

            {/* Lamp 4 */}
            <div className="flex flex-col items-center" style={{ height: "125px" }}>
              <div className="w-[1px] h-22 bg-gradient-to-b from-orange-400/40 via-amber-400/70 to-amber-300" />
              <div className="flex flex-col items-center -mt-1">
                <div className="h-3 w-2 rounded-full bg-gradient-to-t from-orange-500 to-yellow-200 shadow-[0_0_10px_#f59e0b] animate-pulse" />
                <div className="h-2 w-6 rounded-b-full bg-gradient-to-b from-orange-600 to-amber-900 border border-amber-400/80 -mt-0.5" />
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
              className="absolute -top-10 w-[380px] sm:w-[460px] h-[380px] sm:h-[460px] pointer-events-none opacity-20"
              style={{ animation: "spin 50s linear infinite" }}
            >
              <svg viewBox="0 0 400 400" className="w-full h-full stroke-amber-200 fill-none" strokeWidth="1.2">
                <g transform="translate(200,200)">
                  <circle cx="0" cy="0" r="170" strokeDasharray="3,6" />
                  <circle cx="0" cy="0" r="150" />
                  <circle cx="0" cy="0" r="130" strokeDasharray="2,4" />
                  <circle cx="0" cy="0" r="105" />
                  <circle cx="0" cy="0" r="80" />
                  <g>
                    {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5].map((deg) => (
                      <path
                        key={deg}
                        d="M0,-80 Q-20,-115 0,-150 Q20,-115 0,-80"
                        transform={`rotate(${deg})`}
                      />
                    ))}
                  </g>
                </g>
              </svg>
            </div>

            {/* Ambient Warm Glow */}
            <div className="absolute -bottom-6 w-80 h-36 bg-gradient-to-t from-yellow-500/25 via-amber-500/15 to-transparent rounded-full blur-3xl pointer-events-none" />

            {/* TEXT SECTION (PERFECTLY MATCHING IMAGE 2 AUTHENTIC BRUSH LETTERING) */}
            <div className="relative z-30 mb-2 flex flex-col items-center">
              {/* 'Happy' in Flowing Crimson Red Brush Script (Centered directly above Diwali) */}
              <h2
                className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-wide text-[#b91c1c] drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] -mb-1 select-none"
                style={{ fontFamily: "'Marck Script', 'Caveat', cursive" }}
              >
                Happy
              </h2>

              {/* 'Diwali' in Saffron-Orange Textured Calligraphy Brush (Crisp, High Contrast, Natural Festive Glow) */}
              <h1
                className="text-6xl sm:text-8xl md:text-9xl font-bold leading-[1.05] select-none tracking-normal"
                style={{
                  fontFamily: "'Kaushan Script', cursive",
                  color: "#ea580c",
                  background: "linear-gradient(180deg, #ea580c 0%, #f97316 45%, #f59e0b 80%, #fbbf24 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 3px 10px rgba(0, 0, 0, 0.75)) drop-shadow(0 2px 12px rgba(234, 88, 12, 0.45))",
                }}
              >
                Diwali
              </h1>
            </div>

            {/* THE ARTISTIC 3D DIYA (From Image 1 & Image 2) */}
            <div className="relative z-30 flex flex-col items-center mt-1">
              
              {/* Vibrant Flame: Coral Pink Base to Fiery Orange to Golden-White Tip (Image 1) */}
              <div className="relative w-16 h-28 flex items-center justify-center -mb-7 z-20">
                <svg
                  className="w-full h-full"
                  viewBox="0 0 50 90"
                  style={{
                    transformOrigin: "50% 95%",
                    animation: "pulse 0.6s infinite alternate ease-in-out",
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
                    opacity="0.85"
                  />
                </svg>
              </div>

              {/* Diya Clay Bowl with Dual Petal Rim & Stars (Image 1 & 2) */}
              <div className="relative z-10 scale-105 sm:scale-120">
                <svg className="w-48 h-16" viewBox="0 0 160 55">
                  <defs>
                    <linearGradient id="diyaBowlGradReact" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#7c2d12" />
                      <stop offset="50%" stopColor="#451a03" />
                      <stop offset="100%" stopColor="#1e1026" />
                    </linearGradient>
                    <linearGradient id="oilPoolGradReact" x1="0%" y1="50%" x2="100%" y2="50%">
                      <stop offset="0%" stopColor="#ea580c" />
                      <stop offset="50%" stopColor="#f43f5e" />
                      <stop offset="100%" stopColor="#ea580c" />
                    </linearGradient>
                  </defs>

                  {/* Main Ceramic Bowl */}
                  <path
                    d="M12,18 Q80,58 148,18 Q80,24 12,18 Z"
                    fill="url(#diyaBowlGradReact)"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                  />
                  
                  {/* Glowing Oil Pool */}
                  <path
                    d="M18,18 Q80,38 142,18 Q80,20 18,18 Z"
                    fill="url(#oilPoolGradReact)"
                    opacity="0.9"
                  />

                  {/* Dual Petal Center Arch on Rim (From Image 2) */}
                  <path
                    d="M15,18 Q48,32 80,14 Q112,32 145,18"
                    fill="none"
                    stroke="#fde047"
                    strokeWidth="1.8"
                  />

                  {/* Decorative Stars on Lamp Body (From Image 1) */}
                  <g fill="#fde047" opacity="0.85">
                    <circle cx="45" cy="34" r="1.5" />
                    <circle cx="60" cy="38" r="1.8" />
                    <circle cx="75" cy="40" r="1.5" />
                    <circle cx="85" cy="40" r="1.5" />
                    <circle cx="100" cy="38" r="1.8" />
                    <circle cx="115" cy="34" r="1.5" />
                  </g>
                </svg>
              </div>

              {/* Ground Shadow & Light Pool */}
              <div className="w-44 h-5 rounded-[100%] bg-black/70 blur-xs -mt-2" />
              <div className="w-64 h-8 rounded-[100%] bg-amber-400/25 blur-md -mt-4 pointer-events-none" />
            </div>

            {/* Clean Subtitle: 100% Readable */}
            <p className="mt-5 text-[15px] sm:text-[17px] font-semibold text-[#fff8e7] tracking-wider drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
              May your life shine with happiness and prosperity
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
