"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
} from "lucide-react";
import { AnswerDocsLogo } from "@/components/answerdocs-logo";
import { useInterfaceLanguage } from "@/components/interface-language-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const { copy } = useInterfaceLanguage();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();

    setMessage(null);
    setError(null);

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError(copy.auth.invalidEmail);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        throw new Error(copy.auth.requestFailed);
      }

      setMessage(copy.auth.resetLinkSent);
    } catch {
      setError(copy.auth.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 rounded-2xl px-2 py-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.auth.backToLogin}
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
              {copy.auth.forgotPasswordTitle}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy.auth.forgotPasswordSummary}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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

            {error ? (
              <p className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            ) : null}

            {message ? (
              <p className="flex items-center gap-2 rounded-2xl border border-border/80 bg-secondary/70 px-3 py-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {message}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {loading ? copy.auth.sendingResetLink : copy.auth.sendResetLink}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
