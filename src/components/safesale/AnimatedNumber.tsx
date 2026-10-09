import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/** Counts up to `value` when it first renders or changes. */
export function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(from.current, value, {
      duration: 0.8,
      ease: [0.2, 0, 0, 1],
      onUpdate: setDisplay,
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduceMotion]);

  return <span className={className}>{format(reduceMotion ? value : display)}</span>;
}
