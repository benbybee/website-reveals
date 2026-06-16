import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { Bricolage_Grotesque } from "next/font/google";
import { templatesEnabled } from "@/lib/templates/config";
import { FindYourSite } from "@/components/templates/FindYourSite";

// Distinctive display face for the headline — not a default sans.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Claim your free website",
  description: "We already built a website for your business. Find it, then claim it — free.",
};

// Mobile-first: most visitors arrive by scanning the postcard QR on a phone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05070E",
};

export default function JoinPage() {
  if (!templatesEnabled()) notFound();
  // The dark surface lives on the wrapper so there's no light flash before the
  // client experience hydrates; FindYourSite paints the atmosphere + flow.
  return (
    <div className={display.variable} style={{ background: "#05070E", minHeight: "100dvh" }}>
      <FindYourSite />
    </div>
  );
}
