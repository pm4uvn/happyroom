import { THEMES, type ThemeId } from "@happyroom/shared";

/**
 * Lightweight 2D illustration of the birthday room. Used as the loading placeholder, when WebGL is
 * unavailable, and as the visual for reduced-data contexts. Pure SVG: no JS, ~3 KB.
 */
export function SceneFallback({
  themeId,
  candlesLit = true,
  className,
  title,
}: {
  themeId: ThemeId;
  candlesLit?: boolean;
  className?: string;
  title?: string;
}) {
  const p = THEMES[themeId].palette;
  return (
    <svg
      viewBox="0 0 400 300"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="400" height="300" fill={p.sky} />
      {/* Walls */}
      <polygon points="40,60 230,20 230,170 40,215" fill={p.wall} />
      <polygon points="230,20 380,70 380,205 230,170" fill={p.wall} opacity="0.86" />
      {/* Floor */}
      <polygon points="40,215 230,170 380,205 200,290" fill={p.floor} />
      {/* Bunting */}
      {Array.from({ length: 9 }, (_, i) => {
        const x = 52 + i * 20;
        const y = 64 - i * 4.2 + Math.sin((i / 8) * Math.PI) * 10;
        const colors = [p.accent, p.accentSoft, "#F5C870", "#6BCBBE"];
        return (
          <polygon key={i} points={`${x},${y} ${x + 14},${y - 3} ${x + 9},${y + 16}`} fill={colors[i % 4]} />
        );
      })}
      {/* Memory wall */}
      <polygon points="250,62 355,96 355,142 250,108" fill="#E8CFA6" />
      {[0, 1, 2].map((i) => (
        <polygon
          key={i}
          points={`${262 + i * 32},${74 + i * 10} ${284 + i * 32},${81 + i * 10} ${284 + i * 32},${106 + i * 10} ${262 + i * 32},${99 + i * 10}`}
          fill="#fff"
        />
      ))}
      {/* Rug + table + cake */}
      <ellipse cx="205" cy="222" rx="80" ry="28" fill={p.accentSoft} />
      <ellipse cx="205" cy="212" rx="38" ry="12" fill="#fff" />
      <rect x="170" y="182" width="70" height="30" fill="#fff" />
      <ellipse cx="205" cy="182" rx="35" ry="10" fill="#fff" />
      <rect x="182" y="152" width="46" height="28" rx="4" fill="#FFE8BF" />
      <ellipse cx="205" cy="152" rx="23" ry="6" fill="#fff" />
      <rect x="191" y="132" width="28" height="20" rx="3" fill={p.accentSoft} />
      <ellipse cx="205" cy="132" rx="14" ry="4" fill="#fff" />
      {[195, 202, 209, 216].map((x) => (
        <g key={x}>
          <rect x={x - 1.5} y="118" width="3" height="12" fill={p.accent} />
          {candlesLit && <ellipse cx={x} cy="114" rx="2.6" ry="4" fill="#FFC14D" />}
        </g>
      ))}
      {/* Balloons */}
      {[
        [70, 110, p.accent],
        [88, 96, p.accentSoft],
        [104, 114, "#F5C870"],
        [330, 120, "#6BCBBE"],
        [348, 104, p.accent],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <line
            x1={x as number}
            y1={(y as number) + 16}
            x2={x as number}
            y2={(y as number) + 90}
            stroke="#fff"
            strokeWidth="1"
          />
          <ellipse cx={x as number} cy={y as number} rx="13" ry="16" fill={c as string} />
        </g>
      ))}
      {/* Avatars */}
      {[
        [130, 236, "#F5C870"],
        [280, 240, "#6BCBBE"],
        [245, 262, "#F9A6BA"],
        [160, 262, "#9178E8"],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <ellipse cx={x as number} cy={(y as number) + 18} rx="13" ry="4" fill="#182238" opacity="0.15" />
          <rect
            x={(x as number) - 10}
            y={(y as number) - 4}
            width="20"
            height="22"
            rx="10"
            fill={c as string}
          />
          <circle cx={x as number} cy={(y as number) - 12} r="11" fill="#FFF3EA" />
          <circle cx={(x as number) - 4} cy={(y as number) - 12} r="1.6" fill="#182238" />
          <circle cx={(x as number) + 4} cy={(y as number) - 12} r="1.6" fill="#182238" />
        </g>
      ))}
    </svg>
  );
}
