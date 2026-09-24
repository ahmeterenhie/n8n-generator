import { usingDefaultCredentials } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  // Only allow same-site relative redirects
  const next = searchParams.next?.startsWith("/") && !searchParams.next.startsWith("//") ? searchParams.next : "/generator";
  return <LoginForm next={next} showDefaultsHint={usingDefaultCredentials()} />;
}
