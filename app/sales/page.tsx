import { SalesQuickForm } from "@/components/form/SalesQuickForm";

export const metadata = {
  title: "Sales Submission — Website Reveals",
  description: "Internal form for sales agents to submit a website build on behalf of a client.",
  robots: { index: false, follow: false },
};

export default function SalesPage() {
  return <SalesQuickForm />;
}
