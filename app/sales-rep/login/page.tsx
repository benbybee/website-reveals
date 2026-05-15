import { SalesRepLoginForm } from "@/components/sales-rep/SalesRepLoginForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sales Rep Login — Website Reveals",
  robots: { index: false, follow: false },
};

export default function SalesRepLoginPage() {
  return <SalesRepLoginForm />;
}
