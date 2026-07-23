import DriverSignupForm from "@/components/driver-signup-form";

type PageProps = { params: Promise<{ token: string }> };

export default async function DriverSignupPage({ params }: PageProps) {
  const { token } = await params;
  return <DriverSignupForm accessKey={token} />;
}
