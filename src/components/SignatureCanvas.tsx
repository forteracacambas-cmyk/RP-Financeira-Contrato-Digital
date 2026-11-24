import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenTool, RotateCcw } from 'lucide-react';

interface SignatureCanvasProps {
  value: string;
  onChange: (dataUrl: string) => void;
  signerName?: string;
}

interface Point {
  x: number;
  y: number;
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({
  value,
  onChange,
  signerName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const currentStrokeRef = useRef<Point[]>([]);

  const renderStrokes = useCallback((strokeList: Point[][]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Subtle baseline guide for signing
    ctx.strokeStyle = '#E4E4E7';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(24, height - 34);
    ctx.lineTo(width - 24, height - 34);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw ink strokes
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokeList) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      if (stroke.length === 1) {
        ctx.lineTo(stroke[0].x + 0.1, stroke[0].y + 0.1);
      } else {
        for (let i = 1; i < stroke.length - 1; i++) {
          const midX = (stroke[i].x + stroke[i + 1].x) / 2;
          const midY = (stroke[i].y + stroke[i + 1].y) / 2;
          ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, midX, midY);
        }
        const last = stroke[stroke.length - 1];
        ctx.lineTo(last.x, last.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }, []);

  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const cssWidth = Math.max(280, Math.floor(rect.width));
    const cssHeight = 200;

    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      renderStrokes(strokes);
    }
  }, [renderStrokes, strokes]);

  useEffect(() => {
    syncCanvasDimensions();
    window.addEventListener('resize', syncCanvasDimensions);
    return () => window.removeEventListener('resize', syncCanvasDimensions);
  }, [syncCanvasDimensions]);

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const exportSignature = useCallback(
    (strokeList: Point[][]) => {
      const totalPoints = strokeList.reduce((acc, s) => acc + s.length, 0);
      if (strokeList.length === 0 || totalPoints < 5) {
        onChange('');
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      onChange(canvas.toDataURL('image/png'));
    },
    [onChange]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const pt = getPointerPos(e);
    currentStrokeRef.current = [pt];
    setIsDrawing(true);
    renderStrokes([...strokes, currentStrokeRef.current]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pt = getPointerPos(e);
    const last = currentStrokeRef.current[currentStrokeRef.current.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.5) return;
    currentStrokeRef.current.push(pt);
    renderStrokes([...strokes, currentStrokeRef.current]);
  };

  const finishStroke = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const finished = currentStrokeRef.current;
    currentStrokeRef.current = [];
    if (finished.length > 0) {
      const next = [...strokes, finished];
      setStrokes(next);
      renderStrokes(next);
      exportSignature(next);
    }
  };

  const handleClear = () => {
    setStrokes([]);
    currentStrokeRef.current = [];
    renderStrokes([]);
    onChange('');
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const next = strokes.slice(0, -1);
    setStrokes(next);
    renderStrokes(next);
    exportSignature(next);
  };

  const hasSignature = Boolean(value);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <PenTool className="w-4 h-4 text-[#A51C20]" />
          <span>Assinatura Digital Manuscrita (risque com o dedo ou mouse)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokes.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Desfazer
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={strokes.length === 0 && !value}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] text-xs font-medium rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            <Eraser className="w-3.5 h-3.5" />
            Limpar
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative w-full rounded-xl border-2 border-dashed bg-white overflow-hidden transition-colors ${
          hasSignature ? 'border-emerald-600/60' : 'border-zinc-300 hover:border-zinc-400'
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className="block w-full h-[200px] cursor-crosshair touch-none select-none"
          aria-label="Área para assinatura digital manuscrita"
        />
        {strokes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <p className="text-sm font-medium text-zinc-400">
              Assine aqui usando o dedo na tela do celular ou o mouse
            </p>
            {signerName && (
              <p className="text-xs text-zinc-400 mt-1">
                Assinatura referente a {signerName}
              </p>
            )}
          </div>
        )}
        <div className="pointer-events-none absolute bottom-2 left-6 right-6 flex items-center justify-between text-[11px] text-zinc-400">
          <span>Linha de assinatura do contratante</span>
          <span>{hasSignature ? 'Assinatura capturada' : 'Aguardando assinatura'}</span>
        </div>
      </div>
    </div>
  );
};
