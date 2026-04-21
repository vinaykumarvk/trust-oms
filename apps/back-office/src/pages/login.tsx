/**
 * Login Page
 *
 * Simple login form with mock authentication.
 * Stores a mock user in localStorage and redirects to dashboard.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@ui/components/ui/card";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      });

      const body = await res.json();

      if (!res.ok) {
        setError(body?.error?.message || "Login failed");
        setLoading(false);
        return;
      }

      const { user, accessToken, refreshToken } = body.data;
      localStorage.setItem(
        "trustoms-user",
        JSON.stringify({
          id: String(user.id),
          email: user.email,
          name: user.fullName || user.username,
          role: user.role,
        }),
      );
      localStorage.setItem("trustoms-access-token", accessToken);
      localStorage.setItem("trustoms-refresh-token", refreshToken);
      setLoading(false);
      navigate("/", { replace: true });
    } catch {
      setError("Network error — is the API running?");
      setLoading(false);
    }
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
                  autoFocus
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

        <p className="mt-4 text-center text-xs text-muted-foreground">
          TrustOMS Philippines v1.0 &mdash; Phase 0D
        </p>
      </div>
    </div>
  );
}
