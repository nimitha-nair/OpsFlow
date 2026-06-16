import { useAuth } from "../../context/auth-context";

interface WelcomeBannerProps {
  title: string;
  subtitle: string;
}

/** Dashboard landing header: page title + a personalized greeting. */
export function WelcomeBanner({ title, subtitle }: WelcomeBannerProps) {
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-indigo-500/10 via-card to-card p-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {firstName ? `Welcome back, ${firstName}. ` : ""}
        {subtitle}
      </p>
    </div>
  );
}
