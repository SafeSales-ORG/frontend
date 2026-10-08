import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHead, UnheadProvider } from '@unhead/react/client';
import { InferSeoMetaPlugin } from 'unhead/plugins';
import { Suspense } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { MarketSync } from '@/components/MarketSync';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from '@/components/safesale/ErrorBoundary';
import AppRouter from './AppRouter';

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

/**
 * Google OAuth Client ID — set VITE_GOOGLE_CLIENT_ID in your .env.
 * The GoogleOAuthProvider still mounts (silently no-ops) when the var
 * is absent so the app doesn't crash in demo / mock mode.
 */
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

export function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
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
    </GoogleOAuthProvider>
  );
}

export default App;
