import { type FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  HelpCircle,
  Landmark,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "./ui/toast";

type LoginLocationState = {
  from?: string;
  sessionExpired?: boolean;
};

type AuthUser = {
  id?: string | number;
  email?: string;
  fullName?: string;
  name?: string;
  username?: string;
  role?: string;
};

type LoginResponse = {
  data?: { user?: AuthUser };
  user?: AuthUser;
  error?: { message?: string };
  message?: string;
};

type SignalIcon = "shield" | "wallet" | "trend";

type TrustSignal = {
  label: string;
  value: string;
  description: string;
  icon: SignalIcon;
};

export type TrustLoginPageProps = {
  brandEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  mobileTitle: string;
  signInContext: string;
  supportEmail: string;
  rememberKey: string;
  userStorageKey: string;
  submitLabel: string;
  recoveryAudience: string;
  recoveryToastDescription: string;
  focusLabel: string;
  focusBadge: string;
  focusNotes: string[];
  signals: TrustSignal[];
};

const signalIcons = {
  shield: ShieldCheck,
  wallet: WalletCards,
  trend: TrendingUp,
} satisfies Record<SignalIcon, typeof ShieldCheck>;

export function TrustLoginPage({
  brandEyebrow,
  heroTitle,
  heroDescription,
  mobileTitle,
  signInContext,
  supportEmail,
  rememberKey,
  userStorageKey,
  submitLabel,
  recoveryAudience,
  recoveryToastDescription,
  focusLabel,
  focusBadge,
  focusNotes,
  signals,
}: TrustLoginPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const locationState = location.state as LoginLocationState | null;
  const redirectTo = locationState?.from || "/";
  const sessionExpired = Boolean(locationState?.sessionExpired);

  const rememberedUsername = useRef(localStorage.getItem(rememberKey) || "");
  const [username, setUsername] = useState(rememberedUsername.current);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedUsername.current));
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(
    sessionExpired ? "Your session expired. Sign in again to continue." : "",
  );
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState(rememberedUsername.current);
  const [resetSent, setResetSent] = useState(false);
  const [noteIndex, setNoteIndex] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);
  const resetEmailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNoteIndex((index) => (index + 1) % focusNotes.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [focusNotes.length]);

  useEffect(() => {
    if (forgotMode) {
      resetEmailRef.current?.focus();
    }
  }, [forgotMode]);

  const clearError = () => {
    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();

    const trimmedUsername = username.trim();

    if (!trimmedUsername || !password) {
      setError("Enter both username and password.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, password }),
        credentials: "include",
      });

      const body = (await response.json().catch(() => ({}))) as LoginResponse;

      if (!response.ok) {
        throw new Error(body.error?.message || body.message || "Invalid username or password.");
      }

      const user = body.data?.user || body.user || {};

      if (rememberMe) {
        localStorage.setItem(rememberKey, trimmedUsername);
      } else {
        localStorage.removeItem(rememberKey);
      }

      localStorage.setItem(
        userStorageKey,
        JSON.stringify({
          id: String(user.id || trimmedUsername),
          email: user.email,
          name: user.fullName || user.name || user.username || trimmedUsername,
          role: user.role,
        }),
      );

      toast({
        title: "Signed in",
        description: `Welcome back, ${user.fullName || user.name || user.username || trimmedUsername}.`,
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Try again.");
      passwordRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = forgotEmail.trim();

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setResetSent(false);
      setError(`Enter the email address linked to your ${recoveryAudience}.`);
      return;
    }

    setError("");
    setResetSent(true);
    toast({
      title: "Recovery request logged",
      description: recoveryToastDescription,
    });
  };

  return (
    <main className="min-h-dvh overflow-y-auto bg-background text-foreground">
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(27rem,0.95fr)]">
        <section
          aria-labelledby="login-brand-heading"
          className="relative order-2 flex min-h-[23rem] flex-col justify-between overflow-hidden border-t bg-primary/5 p-6 sm:p-8 lg:order-1 lg:min-h-dvh lg:border-r lg:border-t-0 lg:p-10 xl:p-12"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />

          <div className="relative max-w-2xl space-y-8">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Landmark className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                  {brandEyebrow}
                </p>
                <h1
                  id="login-brand-heading"
                  className="mt-1 text-3xl font-semibold tracking-normal text-foreground sm:text-4xl lg:text-5xl"
                >
                  {heroTitle}
                </h1>
              </div>
            </div>

            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              {heroDescription}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {signals.map((signal) => {
                const Icon = signalIcons[signal.icon];
                return (
                  <div
                    key={signal.label}
                    className="rounded-lg border bg-card/90 p-4 shadow-sm backdrop-blur"
                  >
                    <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="text-2xl font-semibold text-foreground">{signal.value}</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{signal.label}</p>
                    <p className="mt-2 text-sm leading-5 text-muted-foreground">
                      {signal.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative mt-8 max-w-2xl rounded-lg border bg-card/90 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-muted-foreground">{focusLabel}</p>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {focusBadge}
              </span>
            </div>
            <p className="min-h-[3.5rem] text-base leading-7 text-foreground" aria-live="polite">
              {focusNotes[noteIndex]}
            </p>
          </div>
        </section>

        <section className="order-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:order-2 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Landmark className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
                  Trust OMS
                </p>
                <p className="text-base font-semibold text-foreground">{mobileTitle}</p>
              </div>
            </div>

            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-primary">Secure sign in</p>
                <p className="text-sm text-muted-foreground">{signInContext}</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${supportEmail}`}>
                  <HelpCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                  Help
                </a>
              </Button>
            </div>

            <Card className="border shadow-lg">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl font-semibold">
                  {forgotMode ? "Recover access" : "Sign in"}
                </CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  {forgotMode
                    ? "Submit your registered email address. The access desk will validate the recovery request."
                    : `Use your Trust OMS ${signInContext.toLowerCase()} account to continue.`}
                </p>
              </CardHeader>
              <CardContent>
                {forgotMode ? (
                  <form className="space-y-5" onSubmit={handleForgotPassword} noValidate>
                    {(error || resetSent) && (
                      <div
                        role={error ? "alert" : "status"}
                        aria-live={error ? "assertive" : "polite"}
                        className={`flex gap-3 rounded-md border p-3 text-sm ${
                          error
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-primary/30 bg-primary/10 text-foreground"
                        }`}
                      >
                        {error ? (
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        )}
                        <span>
                          {error ||
                            "Recovery request captured. Check your inbox or contact the access desk for urgent support."}
                        </span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Registered email</Label>
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          id="forgot-email"
                          ref={resetEmailRef}
                          type="email"
                          autoComplete="email"
                          className="h-11 pl-10 text-base"
                          value={forgotEmail}
                          onChange={(event) => {
                            setForgotEmail(event.target.value);
                            clearError();
                            setResetSent(false);
                          }}
                          required
                        />
                      </div>
                    </div>

                    <Button type="submit" className="h-11 w-full">
                      Request recovery
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 w-full"
                      onClick={() => {
                        setForgotMode(false);
                        setResetSent(false);
                        setError("");
                      }}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                      Back to sign in
                    </Button>
                  </form>
                ) : (
                  <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                    {error && (
                      <div
                        id="login-error"
                        role="alert"
                        aria-live="assertive"
                        className="flex gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{error}</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <div className="relative">
                        <UserRound
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          id="username"
                          type="text"
                          autoComplete="username"
                          className="h-11 pl-10 text-base"
                          value={username}
                          onChange={(event) => {
                            setUsername(event.target.value);
                            clearError();
                          }}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? "login-error" : undefined}
                          maxLength={120}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="password">Password</Label>
                        <button
                          type="button"
                          className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => {
                            setForgotMode(true);
                            setForgotEmail(username);
                            setError("");
                          }}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <LockKeyhole
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          id="password"
                          ref={passwordRef}
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          className="h-11 pl-10 pr-11 text-base"
                          value={password}
                          onChange={(event) => {
                            setPassword(event.target.value);
                            clearError();
                          }}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? "login-error" : undefined}
                          maxLength={256}
                          required
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
                          onClick={() => setShowPassword((visible) => !visible)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="remember"
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked === true)}
                        />
                        <Label htmlFor="remember" className="text-sm font-normal">
                          Remember username
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">No passwords stored</p>
                    </div>

                    <Button type="submit" className="h-11 w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                          Signing in
                        </>
                      ) : (
                        submitLabel
                      )}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

            <div className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Protected workspace for authorized trust banking users.</span>
              <a
                className="font-medium text-primary underline-offset-4 hover:underline"
                href={`mailto:${supportEmail}`}
              >
                Access support
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
