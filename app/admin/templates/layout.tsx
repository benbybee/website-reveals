import { ToastProvider } from "@/components/admin/ToastProvider";

// Wraps the whole Template Sites admin subtree in the WR ToastProvider so the
// CRM, sales board, and builds page can raise WR-branded toasts (and the
// provider's global fetch wrapper surfaces failed /api calls) instead of
// falling back to the console no-op. The standalone /admin/templates pages are
// not under AdminShell, so this is where the provider gets installed for them.
export default function TemplatesAdminLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
