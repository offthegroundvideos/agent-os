"use client";
import { useEffect, useRef } from "react";

// A slow three-layer starfield with the odd shooting star. Pauses while the tab is hidden.
export default function Starfield() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;
    let width = 0;
    let height = 0;
    let stars = [];
    let shooter = null;
    let nextShooter = performance.now() + 4000;
    let frame = 0;
    let last = performance.now();

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(420, Math.floor((width * height) / 3800));
      stars = Array.from({ length: count }, () => {
        const depth = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          depth,
          size: 0.4 + depth * 1.5,
          speed: 2 + depth * 14,
          phase: Math.random() * Math.PI * 2,
          tint: Math.random() < 0.12 ? "167,139,250" : Math.random() < 0.2 ? "34,211,238" : "226,240,255",
        };
      });
    }

    function draw(now) {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        {
          star.x -= star.speed * dt;
          star.y += star.speed * dt * 0.25;
          if (star.x < -2) star.x = width + 2;
          if (star.y > height + 2) star.y = -2;
        }
        const twinkle = 0.55 + 0.45 * Math.sin(now / 900 + star.phase);
        ctx.globalAlpha = (0.25 + star.depth * 0.75) * twinkle;
        ctx.fillStyle = `rgb(${star.tint})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
        if (star.depth > 0.92) {
          ctx.globalAlpha *= 0.25;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      {
        if (!shooter && now > nextShooter) {
          shooter = { x: width * (0.3 + Math.random() * 0.7), y: Math.random() * height * 0.4, life: 0 };
        }
        if (shooter) {
          shooter.life += dt;
          shooter.x -= 900 * dt;
          shooter.y += 320 * dt;
          const alpha = Math.max(0, 1 - shooter.life / 0.9);
          const gradient = ctx.createLinearGradient(shooter.x, shooter.y, shooter.x + 140, shooter.y - 50);
          gradient.addColorStop(0, `rgba(224,251,255,${alpha})`);
          gradient.addColorStop(1, "rgba(34,211,238,0)");
          ctx.globalAlpha = 1;
          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(shooter.x, shooter.y);
          ctx.lineTo(shooter.x + 140, shooter.y - 50);
          ctx.stroke();
          if (alpha <= 0) {
            shooter = null;
            nextShooter = now + 6000 + Math.random() * 9000;
          }
        }
      }
      ctx.globalAlpha = 1;
      if (!document.hidden) frame = requestAnimationFrame(draw);
    }

    function onVisibility() {
      if (!document.hidden) {
        cancelAnimationFrame(frame);
        last = performance.now();
        frame = requestAnimationFrame(draw);
      }
    }

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" />;
}
