/**
 * Login Page
 *
 * Full-featured login form with:
 *   - Username/password auth via /api/v1/auth/login
 *   - Remember Me (persists username to localStorage)
 *   - Forgot Password flow (in-page panel swap)
 *   - Password visibility toggle
 *   - Loading/error states
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Checkbox } from "@ui/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";

const REMEMBER_KEY = "trustoms-remember-user";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  // Restore remembered username on mount
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  // Clear error when user types
  useEffect(() => {
    if (error) setError("");
  }, [email, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both username and password.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
        credentials: "include",
      });

      const body = await res.json();

      if (!res.ok) {
        setError(body?.error?.message || "Login failed");
        setLoading(false);
        return;
      }

      // Remember me: save or clear username
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      const { user } = body.data;
      // Store non-sensitive display data only; tokens are in httpOnly cookies
      localStorage.setItem(
        "trustoms-user",
        JSON.stringify({
          id: String(user.id),
          email: user.email,
          name: user.fullName || user.username,
          role: user.role,
        }),
      );
      setLoading(false);
      navigate("/", { replace: true });
    } catch {
      setError("Network error — is the API running?");
      setLoading(false);
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    // Client-side only — no API call yet
    setForgotSent(true);
  };

  const backToLogin = () => {
    setForgotMode(false);
    setForgotSent(false);
    setForgotEmail("");
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <span className="text-2xl font-bold text-primary-foreground">T</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">TrustOMS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Back Office — Operations Console
          </p>
        </div>

        {forgotMode ? (
          /* ===== Forgot Password Panel ===== */
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Reset Password</CardTitle>
              <CardDescription>
                Enter your username or email to receive a password reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forgotSent ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3 text-sm text-green-800 dark:text-green-200 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200" role="alert">
                    <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>If an account exists for <strong>{forgotEmail}</strong>, a reset link has been sent. Please check your inbox.</span>
                  </div>
                  <Button variant="outline" className="w-full" onClick={backToLogin}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Username or Email</Label>
                    <Input
                      id="forgot-email"
                      type="text"
                      placeholder="Enter your username or email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={!forgotEmail}>
                    Send Reset Link
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={backToLogin} type="button">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Sign In
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        ) : (
          /* ===== Login Form ===== */
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sign In</CardTitle>
              <CardDescription>
                Enter your credentials to access the back office.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Username</Label>
                  <Input
                    id="email"
                    type="text"
                    placeholder="admin"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    autoFocus={!email}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="pr-10"
                      autoFocus={!!email}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm p-1"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={rememberMe}
                      onCheckedChange={(v) => setRememberMe(!!v)}
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm px-1"
                    onClick={() => setForgotMode(true)}
                  >
                    Forgot password?
                  </button>
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          TrustOMS Philippines v1.0 &mdash; Phase 0D
        </p>
      </div>
    </div>
  );
}
