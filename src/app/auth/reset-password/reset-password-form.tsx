"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
} from "lucide-react";
import { AnswerDocsLogo } from "@/components/answerdocs-logo";
import { useInterfaceLanguage } from "@/components/interface-language-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResetStatus = "ready" | "error" | "success";

export function ResetPasswordForm({
  initialStatus,
}: {
  initialStatus: "ready" | "error";
}) {
  const router = useRouter();
  const { copy } = useInterfaceLanguage();
  const [status, setStatus] = useState<ResetStatus>(initialStatus);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError(copy.auth.passwordRequirement);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(copy.auth.passwordsDoNotMatch);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setStatus("error");
          throw new Error(copy.auth.resetPasswordInvalid);
        }

        throw new Error(copy.auth.resetPasswordFailed);
      }

      setNewPassword("");
      setConfirmPassword("");
      setStatus("success");
      window.setTimeout(() => router.replace("/auth"), 1600);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : copy.auth.resetPasswordFailed,
      );
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
              {copy.auth.resetPasswordTitle}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {copy.auth.resetPasswordSummary}
            </p>
          </div>

          {status === "error" ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {copy.auth.resetPasswordInvalid}
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/forgot-password">
                  <KeyRound className="h-4 w-4" />
                  {copy.auth.requestNewResetLink}
                </Link>
              </Button>
            </div>
          ) : null}

          {status === "success" ? (
            <p className="flex items-center gap-2 rounded-2xl border border-border/80 bg-secondary/70 px-3 py-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {copy.auth.resetPasswordSuccess}
            </p>
          ) : null}

          {status === "ready" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="rounded-2xl border border-border/80 bg-secondary/70 px-3 py-2 text-sm text-muted-foreground">
                {copy.auth.resetPasswordReady}
              </p>

              <div className="space-y-2">
                <Label htmlFor="new-password">{copy.auth.newPassword}</Label>
                <Input
                  id="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={copy.auth.newPasswordPlaceholder}
                  type="password"
                  autoComplete="new-password"
                  disabled={loading}
                  minLength={6}
                  required
                />
              </div>

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
                  minLength={6}
                  required
                />
              </div>

              {error ? (
                <p className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {loading
                  ? copy.auth.updatingPassword
                  : copy.auth.updatePassword}
              </Button>
            </form>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
