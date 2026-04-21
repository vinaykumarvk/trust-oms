/**
 * Client Portal Login Page (Phase 5C)
 *
 * Clean login form with teal branding for the client self-service portal.
 * Mock authentication stores client user in localStorage.
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
        "trustoms-client-user",
        JSON.stringify({
          id: String(user.id),
          clientId: String(user.id),
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
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-teal-600 shadow-lg shadow-teal-600/20">
            <span className="text-2xl font-bold text-white">T</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">TrustOMS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Client Portal &mdash; Self-Service
          </p>
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Sign In</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your credentials to access your portfolio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">
                  Username
                </Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="admin"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  className="border-border focus:border-teal-500 focus:ring-teal-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="border-border focus:border-teal-500 focus:ring-teal-500 pr-10"
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
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          TrustOMS Philippines v1.0 &mdash; Phase 5C Client Portal
        </p>
      </div>
    </div>
  );
}
