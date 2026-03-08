import { Barlow_Condensed, Nunito_Sans } from "next/font/google";
import { NovaluxForm } from "@/components/form/NovaluxForm";

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-nv-heading",
  weight: ["600", "700"],
});

const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nv-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "Client Onboarding — NovaLux",
  description: "Complete your onboarding information.",
};

export default function NovaluxPage() {
  return (
    <div className={`${barlow.variable} ${nunito.variable}`}>
      <NovaluxForm />
    </div>
  );
}
