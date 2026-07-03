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
} from "lucide-react";
import { AnswerDocsLogo } from "@/components/answerdocs-logo";
import { useInterfaceLanguage } from "@/components/interface-language-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AuthMode = "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const { language, copy } = useInterfaceLanguage();
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
      setError(copy.auth.passwordsDoNotMatch);
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
        throw new Error(payload.error || copy.auth.authFailed);
      }

      setPassword("");
      setConfirmPassword("");

      if (payload.needsConfirmation) {
        setMessage(
          payload.message ??
            copy.auth.confirmation,
        );
        return;
      }

      router.replace(getSafeNextPath());
      router.refresh();
    } catch (requestError) {
      setError(getFriendlyAuthError(requestError, language));
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
            {copy.common.backToChat}
          </Link>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <AnswerDocsLogo className="h-4 w-4" />
            </span>
            {copy.common.answerDocs}
          </div>
        </div>

        <Card className="animate-panel-in border-border/80 bg-card/90 p-5 shadow-[var(--shadow-soft)]">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "login"
                ? copy.auth.welcomeBack
                : copy.auth.createAccount}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? copy.auth.loginSummary
                : copy.auth.signupSummary}
            </p>
          </div>

          <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)}>
            <TabsList className="grid h-12 w-full grid-cols-2 rounded-2xl p-1.5">
              <TabsTrigger
                value="login"
                className="h-9 min-w-0 gap-1 px-1.5 text-[11px] leading-none min-[380px]:px-2 min-[380px]:text-xs sm:px-3 sm:text-sm"
              >
                <LogIn className="h-4 w-4 shrink-0" />
                {copy.auth.login}
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="h-9 min-w-0 gap-1 px-1.5 text-[11px] leading-none min-[380px]:px-2 min-[380px]:text-xs sm:px-3 sm:text-sm"
              >
                <Plus className="h-4 w-4 shrink-0" />
                {copy.auth.createAccount}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="name">{copy.common.name}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={copy.auth.namePlaceholder}
                  autoComplete="name"
                  disabled={loading}
                  required
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">{copy.common.email}</Label>
              <Input
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={copy.auth.emailPlaceholder}
                type="email"
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{copy.common.password}</Label>
              <Input
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={copy.auth.passwordPlaceholder}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                disabled={loading}
                required
                minLength={mode === "signup" ? 6 : undefined}
              />
              {mode === "login" ? (
                <div className="flex justify-end">
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                  >
                    {copy.auth.forgotPassword}
                  </Link>
                </div>
              ) : null}
            </div>

            {mode === "signup" ? (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">
                  {copy.auth.confirmPassword}
                </Label>
                <Input
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder={copy.auth.confirmPasswordPlaceholder}
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
              {mode === "login" ? copy.auth.login : copy.auth.createAccount}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

function getSafeNextPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");

  if (next?.startsWith("/") && !next.startsWith("//")) {
    return next;
  }

  return "/";
}

function getFriendlyAuthError(
  error: unknown,
  language: "en" | "pt",
) {
  const message =
    error instanceof Error ? error.message : "Could not complete this request.";
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login")) {
    return language === "pt"
      ? "E-mail ou senha incorretos."
      : "Email or password is incorrect.";
  }

  if (
    normalized.includes("already registered") ||
    normalized.includes("already exists")
  ) {
    return language === "pt"
      ? "Já existe uma conta com este e-mail."
      : "An account with this email already exists.";
  }

  if (normalized.includes("password")) {
    return language === "pt"
      ? "Verifique sua senha e tente novamente."
      : "Check your password and try again.";
  }

  if (normalized.includes("email")) {
    return language === "pt"
      ? "Verifique seu e-mail e tente novamente."
      : "Check your email address and try again.";
  }

  return (
    message ||
    (language === "pt"
      ? "Não foi possível concluir esta solicitação."
      : "Could not complete this request.")
  );
}
