"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Languages,
  Loader2,
  Shield,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useInterfaceLanguage } from "@/components/interface-language-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  MIN_ACCOUNT_PASSWORD_LENGTH,
} from "@/lib/account-constants";
import type { AuthenticatedUser } from "@/lib/auth";
import {
  getInterfaceCopy,
  normalizeInterfaceLanguage,
  type InterfaceLanguage,
} from "@/lib/interface-language";
import type { ProfileRecord } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type ProfileSettingsProps = {
  initialUser: AuthenticatedUser;
  initialProfile: ProfileRecord;
};

type ProfileResponse = {
  profile: ProfileRecord;
  error?: string;
};

export function ProfileSettings({
  initialUser,
  initialProfile,
}: ProfileSettingsProps) {
  const router = useRouter();
  const { language, setLanguage, copy } = useInterfaceLanguage();
  const [profile, setProfile] = useState(initialProfile);
  const [fullName, setFullName] = useState(initialProfile.full_name);
  const [interfaceLanguage, setInterfaceLanguage] =
    useState<InterfaceLanguage>(
      normalizeInterfaceLanguage(initialProfile.interface_language),
    );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedLanguage = normalizeInterfaceLanguage(
        initialProfile.interface_language,
      );
      setInterfaceLanguage(savedLanguage);
      setLanguage(savedLanguage);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialProfile.interface_language, setLanguage]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setMessage(null);
    setError(null);

    try {
      const nextProfile = await updateProfile({
        fullName,
      });
      setProfile(nextProfile);
      setFullName(nextProfile.full_name);
      setMessage(copy.profile.profileUpdated);
      router.refresh();
    } catch (requestError) {
      setError(getFriendlyProfileError(requestError, language));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleLanguageChange(nextLanguage: InterfaceLanguage) {
    const previousLanguage = interfaceLanguage;
    setInterfaceLanguage(nextLanguage);
    setLanguage(nextLanguage);
    setSavingLanguage(true);
    setMessage(null);
    setError(null);

    try {
      const nextProfile = await updateProfile({
        interfaceLanguage: nextLanguage,
      });
      setProfile(nextProfile);
      setMessage(getInterfaceCopy(nextLanguage).profile.profileUpdated);
      router.refresh();
    } catch (requestError) {
      setInterfaceLanguage(previousLanguage);
      setLanguage(previousLanguage);
      setError(getFriendlyProfileError(requestError, previousLanguage));
    } finally {
      setSavingLanguage(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUpdatingPassword(true);
    setMessage(null);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError(copy.auth.passwordsDoNotMatch);
      setUpdatingPassword(false);
      return;
    }

    if (newPassword.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
      setError(copy.profile.passwordRequirement);
      setUpdatingPassword(false);
      return;
    }

    try {
      const response = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      await readPayload(response);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(copy.profile.passwordUpdated);
    } catch (requestError) {
      setError(getFriendlyProfileError(requestError, language));
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeletingAccount(true);
    setMessage(null);
    setError(null);

    if (deleteConfirmation !== ACCOUNT_DELETE_CONFIRMATION) {
      setError(copy.profile.deleteConfirmationRequired);
      setDeletingAccount(false);
      return;
    }

    if (!window.confirm(copy.profile.confirmDelete)) {
      setDeletingAccount(false);
      return;
    }

    try {
      const response = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: deletePassword,
          confirmation: deleteConfirmation,
        }),
      });
      await readPayload(response);
      router.replace("/");
      router.refresh();
    } catch (requestError) {
      setError(getFriendlyProfileError(requestError, language));
    } finally {
      setDeletingAccount(false);
    }
  }

  async function updateProfile(input: {
    fullName?: string;
    interfaceLanguage?: InterfaceLanguage;
  }) {
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await readPayload<ProfileResponse>(response);
    return payload.profile;
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/80 bg-card text-muted-foreground shadow-sm outline-none transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={copy.common.backToChat}
              title={copy.common.backToChat}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">
                {copy.common.answerDocs}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                {copy.profile.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.profile.subtitle}
              </p>
            </div>
          </div>
        </header>

        {message || error ? (
          <div className="space-y-2">
            {message ? <ProfileNotice tone="success" message={message} /> : null}
            {error ? <ProfileNotice tone="error" message={error} /> : null}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <section className="space-y-5">
            <Card className="animate-panel-in border-border/80 bg-card/90 p-5 shadow-[var(--shadow-soft)]">
              <SectionHeader
                icon={UserRound}
                title={copy.profile.accountData}
                description={copy.profile.accountDataDescription}
              />
              <form onSubmit={handleProfileSubmit} className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">
                    {copy.profile.displayName}
                  </Label>
                  <Input
                    id="profile-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder={copy.profile.displayNamePlaceholder}
                    autoComplete="name"
                    disabled={savingProfile}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-email">{copy.common.email}</Label>
                  <Input
                    id="profile-email"
                    value={profile.email ?? initialUser.email ?? ""}
                    readOnly
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    {copy.profile.emailReadOnly}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/80 bg-background/65 px-3 py-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {copy.profile.createdAt}:{" "}
                  </span>
                  {formatProfileDate(profile.created_at, language)}
                </div>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {copy.profile.updateProfile}
                </Button>
              </form>
            </Card>

            <Card className="animate-panel-in border-border/80 bg-card/90 p-5 shadow-[var(--shadow-soft)]">
              <SectionHeader
                icon={Shield}
                title={copy.profile.security}
                description={copy.profile.securityDescription}
              />
              <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
                <PasswordField
                  id="current-password"
                  label={copy.profile.currentPassword}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                  disabled={updatingPassword}
                />
                <PasswordField
                  id="new-password"
                  label={copy.profile.newPassword}
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  disabled={updatingPassword}
                  minLength={MIN_ACCOUNT_PASSWORD_LENGTH}
                />
                <PasswordField
                  id="confirm-new-password"
                  label={copy.profile.confirmNewPassword}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  disabled={updatingPassword}
                  minLength={MIN_ACCOUNT_PASSWORD_LENGTH}
                />
                <p className="text-xs text-muted-foreground">
                  {copy.profile.passwordRequirement}
                </p>
                <Button type="submit" disabled={updatingPassword}>
                  {updatingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4" />
                  )}
                  {copy.profile.updatePassword}
                </Button>
              </form>
            </Card>
          </section>

          <aside className="space-y-5">
            <Card className="animate-panel-in border-border/80 bg-card/90 p-5 shadow-[var(--shadow-soft)]">
              <SectionHeader
                icon={Languages}
                title={copy.profile.preferences}
                description={copy.profile.preferencesDescription}
              />
              <div className="mt-5 space-y-3">
                <Label>{copy.profile.interfaceLanguage}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["en", "pt"] as const).map((option) => (
                    <Button
                      key={option}
                      type="button"
                      variant={
                        interfaceLanguage === option ? "default" : "outline"
                      }
                      className="justify-center"
                      disabled={savingLanguage}
                      onClick={() => void handleLanguageChange(option)}
                    >
                      {savingLanguage && interfaceLanguage === option ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {option === "en"
                        ? copy.common.english
                        : copy.common.portuguese}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="animate-panel-in border-destructive/25 bg-card/90 p-5 shadow-[var(--shadow-soft)]">
              <SectionHeader
                icon={Trash2}
                title={copy.profile.dangerZone}
                description={copy.profile.dangerDescription}
                danger
              />
              <form onSubmit={handleDeleteSubmit} className="mt-5 space-y-4">
                <p className="rounded-2xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {copy.profile.deleteWarning}
                </p>
                <PasswordField
                  id="delete-password"
                  label={copy.profile.deletePasswordLabel}
                  value={deletePassword}
                  onChange={setDeletePassword}
                  autoComplete="current-password"
                  disabled={deletingAccount}
                />
                <div className="space-y-2">
                  <Label htmlFor="delete-confirmation">
                    {copy.profile.deleteConfirmationLabel}
                  </Label>
                  <Input
                    id="delete-confirmation"
                    value={deleteConfirmation}
                    onChange={(event) =>
                      setDeleteConfirmation(event.target.value)
                    }
                    placeholder={copy.profile.deleteConfirmationPlaceholder}
                    disabled={deletingAccount}
                  />
                </div>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deletingAccount}
                >
                  {deletingAccount ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {copy.profile.deleteAccount}
                </Button>
              </form>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
  danger = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-accent-foreground shadow-sm",
          danger && "bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled: boolean;
  minLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        autoComplete={autoComplete}
        disabled={disabled}
        minLength={minLength}
        required
      />
    </div>
  );
}

function ProfileNotice({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div className="animate-panel-in flex items-center gap-2 rounded-2xl border border-border/80 bg-card/85 px-3 py-2 text-sm shadow-sm">
      <Icon
        className={
          tone === "success"
            ? "h-4 w-4 text-accent-foreground"
            : "h-4 w-4 text-destructive"
        }
      />
      <span className={tone === "error" ? "text-destructive" : undefined}>
        {message}
      </span>
    </div>
  );
}

async function readPayload<T = unknown>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function formatProfileDate(value: string, language: InterfaceLanguage) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : "en-US", {
    dateStyle: "medium",
  }).format(date);
}

function getFriendlyProfileError(
  error: unknown,
  language: InterfaceLanguage,
) {
  const message =
    error instanceof Error ? error.message : "Could not complete this request.";
  const normalized = message.toLowerCase();

  if (normalized.includes("current password is incorrect")) {
    return language === "pt"
      ? "A senha atual está incorreta."
      : "Current password is incorrect.";
  }

  if (normalized.includes("different")) {
    return language === "pt"
      ? "Escolha uma nova senha diferente da atual."
      : "Choose a new password that is different.";
  }

  if (normalized.includes("could not verify")) {
    return language === "pt"
      ? "Não foi possível verificar esta conta. Saia e entre novamente."
      : "Could not verify this account. Sign out and sign in again.";
  }

  if (normalized.includes("passwords do not match")) {
    return language === "pt"
      ? "As senhas não coincidem."
      : "Passwords do not match.";
  }

  if (normalized.includes("delete")) {
    return language === "pt"
      ? "Não foi possível excluir a conta."
      : "Could not delete account.";
  }

  if (normalized.includes("password")) {
    return language === "pt"
      ? "Não foi possível atualizar a senha."
      : "Could not update password.";
  }

  if (normalized.includes("profile")) {
    return language === "pt"
      ? "Não foi possível atualizar o perfil."
      : "Could not update profile.";
  }

  return (
    message ||
    (language === "pt"
      ? "Não foi possível concluir esta solicitação."
      : "Could not complete this request.")
  );
}
