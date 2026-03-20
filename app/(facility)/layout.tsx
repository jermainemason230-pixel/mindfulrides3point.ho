import { AppLayout } from "@/components/layout/AppLayout";

export default function FacilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
