import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHead, UnheadProvider } from '@unhead/react/client';
import { InferSeoMetaPlugin } from 'unhead/plugins';
import { Suspense, type ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { MotionConfig } from 'motion/react';
import { MarketSync } from '@/components/MarketSync';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from '@/components/safesale/ErrorBoundary';
import AppRouter from './AppRouter';
import { GOOGLE_CLIENT_ID, GOOGLE_SIGN_IN_ENABLED } from '@/lib/config';

const head = createHead({
  plugins: [
    InferSeoMetaPlugin(),
  ],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 minute
      gcTime: Infinity,
    },
  },
});

/** Google's provider only mounts when sign-in is configured (see lib/config). */
function GoogleProvider({ children }: { children: ReactNode }) {
  if (!GOOGLE_SIGN_IN_ENABLED) return <>{children}</>;
  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{children}</GoogleOAuthProvider>;
}

export function App() {
  return (
    <GoogleProvider>
      {/* Animations are skipped for people who ask their OS to reduce motion. */}
      <MotionConfig reducedMotion="user">
        <UnheadProvider head={head}>
          <QueryClientProvider client={queryClient}>
            <MarketSync />
            <TooltipProvider>
              <Toaster />
              <ErrorBoundary>
                <Suspense>
                  <AppRouter />
                </Suspense>
              </ErrorBoundary>
            </TooltipProvider>
          </QueryClientProvider>
        </UnheadProvider>
      </MotionConfig>
    </GoogleProvider>
  );
}

export default App;
