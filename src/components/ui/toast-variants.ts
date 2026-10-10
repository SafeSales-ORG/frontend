import { cva } from "class-variance-authority"

export const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl p-4 pr-10 shadow-[var(--shadow-float)] transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x) data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-6 data-[state=open]:zoom-in-95 data-[state=open]:duration-300",
  {
    variants: {
      variant: {
        default: "bg-forest text-canvas",
        destructive: "destructive group bg-negative-pale text-negative ring-1 ring-negative/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)
