import { forwardRef } from "react";
import {
  QR_LOGO_SRC,
  QR_THEME_DEF,
  SUN_RING_COLOR,
  buildQrModel,
  modulesPath,
  type QrModel,
  type QrStyle,
} from "@/lib/qrStyle";

/**
 * A branded QR code as one inline SVG: gradient fill, rounded or square
 * modules, rounded finder "eyes", and the Bughaw logo on a white tile with an
 * optional gold sun ring. Hook-free, so it renders on the server for the public
 * page; the admin designer reuses it and serialises the SVG for PNG export.
 */
export const StyledQr = forwardRef<
  SVGSVGElement,
  {
    value: string;
    qrStyle: QrStyle;
    /** Unique per page — scopes the gradient id. */
    id: string;
    /** Override for export (e.g. an inlined data: URL). */
    logoHref?: string;
    margin?: number;
    model?: QrModel;
    className?: string;
    title?: string;
  }
>(function StyledQr({ value, qrStyle, id, logoHref = QR_LOGO_SRC, margin = 2, model, className, title }, ref) {
  const m = model ?? buildQrModel(value, qrStyle, margin);
  const full = m.size + m.margin * 2;
  const gradientId = `${id}-fill`;
  const fill = `url(#${gradientId})`;
  const eyeRadius = qrStyle.rounded ? 2 : 0;
  const pupilRadius = qrStyle.rounded ? 1 : 0;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox={`0 0 ${full} ${full}`}
      shapeRendering={qrStyle.rounded ? "geometricPrecision" : "crispEdges"}
      role="img"
      aria-label={title ?? "QR code"}
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={full} y2={full}>
          {QR_THEME_DEF[qrStyle.theme].stops.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <rect width={full} height={full} fill="#FFFFFF" />
      <path d={modulesPath(m, qrStyle.rounded)} fill={fill} />
      {m.finders.map(([fx, fy]) => {
        const x = fx + m.margin;
        const y = fy + m.margin;
        return (
          <g key={`${fx}-${fy}`}>
            <rect
              x={x + 0.5}
              y={y + 0.5}
              width={6}
              height={6}
              rx={eyeRadius}
              fill="none"
              stroke={fill}
              strokeWidth={1}
            />
            <rect x={x + 2} y={y + 2} width={3} height={3} rx={pupilRadius} fill={fill} />
          </g>
        );
      })}
      {m.logo && (
        <g>
          <rect
            x={m.logo.x + m.margin}
            y={m.logo.y + m.margin}
            width={m.logo.size}
            height={m.logo.size}
            rx={m.logo.size * 0.22}
            fill="#FFFFFF"
            stroke={qrStyle.sunRing ? SUN_RING_COLOR : "none"}
            strokeWidth={qrStyle.sunRing ? Math.max(0.35, m.logo.size * 0.045) : 0}
          />
          <image
            href={logoHref}
            x={m.logo.x + m.margin + m.logo.size * 0.1}
            y={m.logo.y + m.margin + m.logo.size * 0.1}
            width={m.logo.size * 0.8}
            height={m.logo.size * 0.8}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      )}
    </svg>
  );
});
