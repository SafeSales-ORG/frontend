import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** Scroll position per history entry, so Back returns to the same spot. */
const positions = new Map<string, number>();

export function ScrollToTop() {
  const location = useLocation();
  const navType = useNavigationType();
  const lastPath = useRef(location.pathname);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // Remember where this page was scrolled to when we leave it.
  useLayoutEffect(() => {
    const key = location.key;
    return () => {
      positions.set(key, window.scrollY);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    const saved = navType === 'POP' ? positions.get(location.key) : undefined;
    const samePage = lastPath.current === location.pathname;
    lastPath.current = location.pathname;
    if (saved === undefined) {
      // Filters and tabs only change the query string; keep the scroll there.
      if (!samePage) window.scrollTo(0, 0);
      return;
    }
    // Content may still be rendering; retry until the page is tall enough.
    let frame = 0;
    let tries = 0;
    const restore = () => {
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(saved, Math.max(0, maxY)));
      if (maxY < saved && tries++ < 60) frame = requestAnimationFrame(restore);
    };
    restore();
    return () => cancelAnimationFrame(frame);
  }, [location.key, location.pathname, navType]);

  return null;
}
