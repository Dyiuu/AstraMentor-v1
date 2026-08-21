import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  originX: number; // For elastic movement
  originY: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  baseAlpha: number;
  angle: number;
}

const StarBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const mouse = useRef<{ x: number, y: number }>({ x: -9999, y: -9999 });
  const animationFrameId = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      
      initParticles();
    };

    const initParticles = () => {
      particles.current = [];
      const width = window.innerWidth;
      const height = window.innerHeight;
      const particleCount = Math.min(width * height / 9000, 150); 
      
      for (let i = 0; i < particleCount; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        particles.current.push({
          x,
          y,
          originX: x, // Not used heavily if we drift, but useful for static grids
          originY: y,
          vx: (Math.random() - 0.5) * 0.5, 
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 2 + 1, 
          color: `rgba(${130 + Math.random() * 50}, ${160 + Math.random() * 90}, 255,`, 
          baseAlpha: Math.random() * 0.4 + 0.1,
          angle: Math.random() * Math.PI * 2
        });
      }
    };

    const animate = () => {
      if (!canvas || !ctx) return;
      const width = window.innerWidth;
      const height = window.innerHeight;

      ctx.clearRect(0, 0, width, height);
      
      particles.current.forEach((p, index) => {
        // Basic drift
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Mouse Interaction Calculation
        const dx = mouse.current.x - p.x;
        const dy = mouse.current.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const interactionRadius = 200;

        let alpha = p.baseAlpha;
        let size = p.size;

        if (dist < interactionRadius) {
            // Magnetic attraction
            const force = (interactionRadius - dist) / interactionRadius;
            p.x += dx * force * 0.03;
            p.y += dy * force * 0.03;

            // Glow effect
            size = p.size * (1 + force * 1.5); // Up to 2.5x size
            alpha = p.baseAlpha + force * 0.6; // Brighter
            
            // Draw connection to mouse
            ctx.beginPath();
            ctx.strokeStyle = `rgba(147, 197, 253, ${force * 0.5})`; // Blue-300
            ctx.lineWidth = force * 1.5;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.current.x, mouse.current.y);
            ctx.stroke();
        }

        // Pulse
        p.angle += 0.02;
        alpha += Math.sin(p.angle) * 0.1;

        // Draw Star
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color} ${Math.max(0, Math.min(1, alpha))})`;
        ctx.fill();

        // Connect nearby stars
        for (let j = index + 1; j < particles.current.length; j++) {
            const p2 = particles.current[j];
            const dx2 = p.x - p2.x;
            const dy2 = p.y - p2.y;
            const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

            if (dist2 < 100) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(147, 197, 253, ${0.15 * (1 - dist2 / 100)})`;
                ctx.lineWidth = 0.5;
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
      });

      animationFrameId.current = requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        mouse.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const handleMouseLeave = () => {
        mouse.current = { x: -9999, y: -9999 };
    }

    window.addEventListener('resize', resizeCanvas);
    // Use window listener for mouse so we catch it even if not directly over canvas (though canvas covers all)
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave); // Clear when leaving window
    
    resizeCanvas();
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  return (
    <canvas 
        ref={canvasRef} 
        className="absolute top-0 left-0 w-full h-full pointer-events-auto z-0"
        style={{ background: 'transparent' }} 
    />
  );
};

export default StarBackground;
