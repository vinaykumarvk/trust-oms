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
        credentials: "include",
      });

      const body = await res.json();

      if (!res.ok) {
        setError(body?.error?.message || "Login failed");
        setLoading(false);
        return;
      }

      const { user } = body.data;
      // Store non-sensitive display data only; tokens are in httpOnly cookies
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
      setLoading(false);
      navigate("/", { replace: true });
    } catch {
      setError("Network error — is the API running?");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted dark:bg-gray-950 px-3 sm:px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-6 sm:mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-teal-600 shadow-lg shadow-teal-600/20">
            <span className="text-xl sm:text-2xl font-bold text-white">T</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-white">TrustOMS</h1>
          <p className="mt-1 text-sm text-muted-foreground dark:text-gray-400">
            Client Portal &mdash; Self-Service
          </p>
        </div>

        <Card className="border-border dark:border-gray-700 dark:bg-gray-800 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-foreground dark:text-gray-100">Sign In</CardTitle>
            <CardDescription className="text-muted-foreground dark:text-gray-400">
              Enter your credentials to access your portfolio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground dark:text-gray-200">
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
                  className="border-border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400 focus:border-teal-500 focus:ring-teal-500"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground dark:text-gray-200">
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
                    className="border-border dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400 focus:border-teal-500 focus:ring-teal-500 pr-10"
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
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
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

        <p className="mt-4 text-center text-xs text-muted-foreground dark:text-gray-500">
          TrustOMS Philippines v1.0 &mdash; Phase 5C Client Portal
        </p>
      </div>
    </div>
  );
}
