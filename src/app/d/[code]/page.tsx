import DriverSignupForm from "@/components/driver-signup-form";

type PageProps = { params: Promise<{ code: string }> };

export default async function ShortDriverSignupPage({ params }: PageProps) {
  const { code } = await params;
  return <DriverSignupForm accessKey={code} />;
}
