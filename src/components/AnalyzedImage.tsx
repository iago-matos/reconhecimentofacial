import type { Box } from "@/lib/image";

interface Props {
  src: string;
  width: number;
  height: number;
  boxes: { box: Box; label: string; highlight: boolean }[];
  scanning?: boolean;
}

/**
 * Foto congelada com os rostos numerados.
 * O SVG usa o mesmo tamanho da foto (viewBox) e o mesmo encaixe (contain),
 * então os quadros ficam sempre em cima do rosto, em qualquer proporção de imagem.
 */
export default function AnalyzedImage({ src, width, height, boxes, scanning }: Props) {
  const stroke = Math.max(2, width / 250);
  const font = Math.max(14, width / 22);
  return (
    <div className="relative mx-auto w-full overflow-hidden rounded-lg border-2 border-primary/50 bg-black">
      <svg viewBox={`0 0 ${width} ${height}`} className="block max-h-[60svh] w-full" role="img" aria-label="Foto analisada">
        <image href={src} width={width} height={height} />
        {boxes.map(({ box: [x, y, w, h], label, highlight }, i) => {
          const color = highlight ? "hsl(45 100% 55%)" : "hsl(215 15% 75%)";
          const tagW = font * (0.75 + label.length * 0.6);
          const tagY = y - font * 1.3 >= 0 ? y - font * 1.3 : y + h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={h} fill="none" stroke={color} strokeWidth={stroke} rx={stroke * 2} />
              <rect x={x} y={tagY} width={tagW} height={font * 1.3} fill={color} rx={stroke * 2} />
              <text x={x + font * 0.35} y={tagY + font * 1.0} fontSize={font} fontWeight={700} fill="hsl(220 20% 10%)">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      {scanning && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 h-1 animate-scan bg-primary/70" />
        </div>
      )}
    </div>
  );
}
