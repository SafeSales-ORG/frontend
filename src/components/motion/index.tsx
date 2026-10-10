import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";

const EASE = [0.2, 0, 0, 1] as const;

/** Fade/slide a page in when it mounts. Wrap each page's main content. */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const containerVariants = {
  hidden: {},
  show: (stagger: number) => ({ transition: { staggerChildren: stagger, delayChildren: 0.05 } }),
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

type ListTag = "div" | "ul" | "ol" | "tbody";

/**
 * Children wrapped in <StaggerItem> cascade in one after another.
 * `inView` waits until the group scrolls into view (marketing pages).
 */
export function Stagger({
  as = "div",
  children,
  className,
  stagger = 0.06,
  inView = false,
}: {
  as?: ListTag;
  children: ReactNode;
  className?: string;
  stagger?: number;
  inView?: boolean;
}) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      variants={containerVariants}
      custom={stagger}
      initial="hidden"
      {...(inView ? { whileInView: "show", viewport: { once: true, margin: "-60px" } } : { animate: "show" })}
    >
      {children}
    </Comp>
  );
}

export function StaggerItem({
  as = "div",
  children,
  className,
  lift = false,
}: {
  as?: "div" | "li" | "tr";
  children: ReactNode;
  className?: string;
  /** Rise slightly on hover (for clickable cards). */
  lift?: boolean;
}) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      variants={itemVariants}
      {...(lift ? { whileHover: { y: -3 }, transition: { type: "spring", stiffness: 400, damping: 28 } } : {})}
    >
      {children}
    </Comp>
  );
}

/** A card that rises a little on hover and presses in on tap. */
export function LiftCard({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
