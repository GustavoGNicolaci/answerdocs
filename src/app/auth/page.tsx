"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  LogIn,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AuthMode = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(
        mode === "login" ? "/api/auth/login" : "/api/auth/signup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "login"
              ? { email, password }
              : { name, email, password, confirmPassword },
          ),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        needsConfirmation?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Authentication failed.");
      }

      setPassword("");
      setConfirmPassword("");

      if (payload.needsConfirmation) {
        setMessage(
          payload.message ??
            "Account created. Check your email if confirmation is enabled.",
        );
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (requestError) {
      setError(getFriendlyAuthError(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl px-2 py-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to chat
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            AnswerDocs
          </div>
        </div>

        <Card className="animate-panel-in border-border/80 bg-card/90 p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Sign in to keep folders, chats, documents, and history saved."
                : "Start saving your workspace across folders and chats."}
            </p>
          </div>

          <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">
                <LogIn className="mr-2 h-4 w-4" />
                Login
              </TabsTrigger>
              <TabsTrigger value="signup">
                <Plus className="mr-2 h-4 w-4" />
                Create account
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  disabled={loading}
                  required
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                disabled={loading}
                required
                minLength={mode === "signup" ? 6 : undefined}
              />
            </div>

            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat your password"
                  type="password"
                  autoComplete="new-password"
                  disabled={loading}
                  required
                  minLength={6}
                />
              </div>
            ) : null}

            {error ? (
              <p className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            ) : null}

            {message ? (
              <p className="rounded-2xl border border-border/80 bg-secondary/70 px-3 py-2 text-sm text-muted-foreground">
                {message}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "login" ? (
                <LogIn className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {mode === "login" ? "Login" : "Create account"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

function getFriendlyAuthError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Could not complete this request.";
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login")) {
    return "Email or password is incorrect.";
  }

  if (
    normalized.includes("already registered") ||
    normalized.includes("already exists")
  ) {
    return "An account with this email already exists.";
  }

  if (normalized.includes("password")) {
    return "Check your password and try again.";
  }

  if (normalized.includes("email")) {
    return "Check your email address and try again.";
  }

  return message || "Could not complete this request.";
}
