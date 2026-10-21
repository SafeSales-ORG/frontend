import { CheckCircle, WarningCircle } from "@phosphor-icons/react"
import { useToast } from "@/hooks/useToast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const Icon = props.variant === "destructive" ? WarningCircle : CheckCircle
        return (
          <Toast key={id} {...props}>
            <Icon
              size={22}
              weight="fill"
              className={props.variant === "destructive" ? "mt-px shrink-0 text-negative" : "mt-px shrink-0 text-mint"}
              aria-hidden
            />
            <div className="grid flex-1 gap-0.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
