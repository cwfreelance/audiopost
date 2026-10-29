import type { CSSProperties } from "react";
import { METER_BARS } from "./mark-bars";
import styles from "./mark.module.css";

// The logo mark, built from its parts: the rough stamp as a mask, and the five rough meter bars
// over it. While `playing`, the bars move like a level meter; otherwise they hold the logo's heights.
// Colors come from --mark-stamp and --mark-bars, defaulting to the logo's own.
export function Mark({ playing = false, className, style }: { playing?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span className={className ? `${styles.mark} ${className}` : styles.mark} data-playing={playing} style={style} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        {METER_BARS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}
