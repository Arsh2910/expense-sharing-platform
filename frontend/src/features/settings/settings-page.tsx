import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  Monitor,
  ShieldAlert,
  User as UserIcon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ComingSoonPanel } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  useChangeEmailMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
  useLogoutMutation,
  useUpdateProfileMutation,
} from "@/features/auth/auth.queries";
import {
  changeEmailFormSchema,
  changePasswordFormSchema,
  deleteAccountFormSchema,
  updateProfileFormSchema,
  type ChangeEmailFormValues,
  type ChangePasswordFormValues,
  type DeleteAccountFormValues,
  type UpdateProfileFormValues,
} from "@/features/auth/auth.schemas";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/format";

export function AccountSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const updateProfileMutation = useUpdateProfileMutation();
  const changeEmailMutation = useChangeEmailMutation();
  const changePasswordMutation = useChangePasswordMutation();
  const logoutMutation = useLogoutMutation();
  const deleteAccountMutation = useDeleteAccountMutation();
  const { reset: resetDeleteMutation } = deleteAccountMutation;

  const [pendingEmailNotice, setPendingEmailNotice] = React.useState<
    string | null
  >(null);
  const [showPasswords, setShowPasswords] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  // 1. Profile form
  const profileForm = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(updateProfileFormSchema),
    defaultValues: {
      displayName: user?.displayName ?? "",
      username: user?.username ?? "",
    },
  });

  React.useEffect(() => {
    if (user) {
      profileForm.reset({
        displayName: user.displayName,
        username: user.username ?? "",
      });
    }
  }, [user, profileForm]);

  const onProfileSubmit = async (values: UpdateProfileFormValues) => {
    const trimmedDisplayName = values.displayName.trim();
    const trimmedUsername = values.username.trim();
    const normalizedUsername = trimmedUsername === "" ? null : trimmedUsername;

    const payload: { displayName?: string; username?: string | null } = {};
    if (trimmedDisplayName !== user?.displayName) {
      payload.displayName = trimmedDisplayName;
    }
    if (normalizedUsername !== (user?.username ?? null)) {
      payload.username = normalizedUsername;
    }

    if (Object.keys(payload).length === 0) {
      toast({
        title: "No changes to save",
        description: "Your profile details are already up to date.",
        variant: "info",
      });
      return;
    }

    try {
      await updateProfileMutation.mutateAsync(payload);
      toast({
        title: "Profile updated",
        description: "Your display profile has been saved.",
        variant: "success",
      });
    } catch {
      // Handled via updateProfileMutation.error
    }
  };

  // 2. Email change form
  const emailForm = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(changeEmailFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onEmailSubmit = async (values: ChangeEmailFormValues) => {
    const targetEmail = values.email.trim().toLowerCase();
    setPendingEmailNotice(null);

    try {
      await changeEmailMutation.mutateAsync({
        email: targetEmail,
        password: values.password,
      });
      setPendingEmailNotice(targetEmail);
      emailForm.reset({ email: "", password: "" });
      toast({
        title: "Verification email requested",
        description: `Check ${targetEmail} to confirm your new email address.`,
        variant: "success",
      });
    } catch {
      // Handled via changeEmailMutation.error
    }
  };

  // 3. Password change form
  const passwordForm = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  const onPasswordSubmit = async (values: ChangePasswordFormValues) => {
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.reset({
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      });
      toast({
        title: "Password updated",
        description:
          "Your password changed and all other active sessions were signed out.",
        variant: "success",
      });
    } catch {
      // Handled via changePasswordMutation.error
    }
  };

  // 4. Logout handler
  const handleLogoutCurrentSession = async () => {
    await logoutMutation.mutateAsync();
    toast({
      title: "Signed out",
      description: "Your session has been closed.",
      variant: "info",
    });
    navigate("/login", { replace: true });
  };

  // 5. Delete account form inside confirmation dialog
  const deleteForm = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountFormSchema),
    defaultValues: {
      currentPassword: "",
      confirmationText: "",
    },
  });

  const handleDeleteDialogOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        deleteForm.reset({ currentPassword: "", confirmationText: "" });
        resetDeleteMutation();
      }
      setDeleteDialogOpen(nextOpen);
    },
    [deleteForm, resetDeleteMutation],
  );

  const onDeleteSubmit = async (values: DeleteAccountFormValues) => {
    try {
      await deleteAccountMutation.mutateAsync({
        currentPassword: values.currentPassword,
      });
      handleDeleteDialogOpenChange(false);
      navigate("/login", {
        replace: true,
        state: { accountDeleted: true },
      });
    } catch {
      // Handled via deleteAccountMutation.error
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Account Settings"
        description="Manage your profile details, email address, password, and active session."
      />

      <div className="space-y-6">
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <UserIcon
                  className="h-4.5 w-4.5 text-[#0F766E]"
                  aria-hidden="true"
                />
                <CardTitle>Profile details</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="accent">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {user.emailVerifiedAt ? "Verified account" : "Pending verification"}
                </Badge>
                <span className="text-xs text-[#71717A]">
                  Joined {formatDate(user.createdAt)}
                </span>
              </div>
            </div>
            <CardDescription>
              How your name and handle appear to members in your shared groups.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={profileForm.handleSubmit(onProfileSubmit)}
              noValidate
              className="space-y-4 max-w-lg"
            >
              {updateProfileMutation.error && (
                <Alert variant="error">
                  {getErrorMessage(updateProfileMutation.error)}
                </Alert>
              )}

              <FormField
                id="settings-display-name"
                label="Display name"
                error={profileForm.formState.errors.displayName?.message}
                required
              >
                <Input
                  id="settings-display-name"
                  hasError={Boolean(profileForm.formState.errors.displayName)}
                  {...profileForm.register("displayName")}
                />
              </FormField>

              <FormField
                id="settings-username"
                label="Username (optional)"
                hint="2–30 characters using letters, numbers, and underscores. Leave blank to clear."
                error={profileForm.formState.errors.username?.message}
              >
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-[#71717A]"
                  >
                    @
                  </span>
                  <Input
                    id="settings-username"
                    placeholder="username"
                    className="pl-8"
                    hasError={Boolean(profileForm.formState.errors.username)}
                    {...profileForm.register("username")}
                  />
                </div>
              </FormField>

              <div className="pt-1">
                <Button
                  type="submit"
                  isLoading={updateProfileMutation.isPending}
                >
                  Save profile
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Email Change */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <Mail
                className="h-4.5 w-4.5 text-[#0F766E]"
                aria-hidden="true"
              />
              <CardTitle>Email address</CardTitle>
            </div>
            <CardDescription>
              Your primary sign-in email is{" "}
              <span className="font-medium text-[#18181B]">{user.email}</span>.
              Updating your email requires verification before it takes effect.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={emailForm.handleSubmit(onEmailSubmit)}
              noValidate
              className="space-y-4 max-w-lg"
            >
              {pendingEmailNotice && (
                <Alert variant="success" title="Verification pending">
                  We sent a verification link to{" "}
                  <span className="font-medium">{pendingEmailNotice}</span>. Your
                  current email ({user.email}) remains active until you verify
                  the new address.
                </Alert>
              )}

              {changeEmailMutation.error && (
                <Alert variant="error">
                  {getErrorMessage(changeEmailMutation.error)}
                </Alert>
              )}

              <FormField
                id="settings-new-email"
                label="New email address"
                error={emailForm.formState.errors.email?.message}
                required
              >
                <Input
                  id="settings-new-email"
                  type="email"
                  autoComplete="email"
                  placeholder="new-address@example.com"
                  hasError={Boolean(emailForm.formState.errors.email)}
                  {...emailForm.register("email")}
                />
              </FormField>

              <FormField
                id="settings-email-password"
                label="Current password"
                error={emailForm.formState.errors.password?.message}
                required
              >
                <Input
                  id="settings-email-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Confirm with your password"
                  hasError={Boolean(emailForm.formState.errors.password)}
                  {...emailForm.register("password")}
                />
              </FormField>

              <div className="pt-1">
                <Button
                  type="submit"
                  variant="outline"
                  isLoading={changeEmailMutation.isPending}
                >
                  Request email change
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Password Change */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <KeyRound
                className="h-4.5 w-4.5 text-[#0F766E]"
                aria-hidden="true"
              />
              <CardTitle>Change password</CardTitle>
            </div>
            <CardDescription>
              Updating your password revokes all other active sessions across
              your devices while keeping this session signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              noValidate
              className="space-y-4 max-w-lg"
            >
              {changePasswordMutation.error && (
                <Alert variant="error">
                  {getErrorMessage(changePasswordMutation.error)}
                </Alert>
              )}

              <FormField
                id="settings-current-password"
                label="Current password"
                error={passwordForm.formState.errors.currentPassword?.message}
                required
              >
                <div className="relative">
                  <Input
                    id="settings-current-password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="current-password"
                    className="pr-10"
                    hasError={Boolean(
                      passwordForm.formState.errors.currentPassword,
                    )}
                    {...passwordForm.register("currentPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((prev) => !prev)}
                    aria-label={
                      showPasswords ? "Hide passwords" : "Show passwords"
                    }
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-[#71717A] transition-colors hover:text-[#18181B]"
                  >
                    {showPasswords ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </FormField>

              <FormField
                id="settings-new-password"
                label="New password"
                hint="Use 8 to 72 characters."
                error={passwordForm.formState.errors.newPassword?.message}
                required
              >
                <Input
                  id="settings-new-password"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  hasError={Boolean(passwordForm.formState.errors.newPassword)}
                  {...passwordForm.register("newPassword")}
                />
              </FormField>

              <FormField
                id="settings-confirm-new-password"
                label="Confirm new password"
                error={passwordForm.formState.errors.confirmNewPassword?.message}
                required
              >
                <Input
                  id="settings-confirm-new-password"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  hasError={Boolean(
                    passwordForm.formState.errors.confirmNewPassword,
                  )}
                  {...passwordForm.register("confirmNewPassword")}
                />
              </FormField>

              <div className="pt-1">
                <Button
                  type="submit"
                  isLoading={changePasswordMutation.isPending}
                >
                  Update password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Session Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <Monitor
                className="h-4.5 w-4.5 text-[#0F766E]"
                aria-hidden="true"
              />
              <CardTitle>Session management</CardTitle>
            </div>
            <CardDescription>
              Your authentication state uses secure HttpOnly cookies with
              automatic token rotation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 rounded-lg border border-[#E7E5E0] bg-[#FAF9F6] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#18181B]">
                    Current browser session
                  </span>
                  <Badge variant="accent">Active</Badge>
                </div>
                <p className="text-xs text-[#52525B]">
                  Signed in as {user.email}. Signing out revokes this session on
                  the server and clears authentication cookies.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogoutCurrentSession}
                isLoading={logoutMutation.isPending}
                className="shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign out
              </Button>
            </div>

            <ComingSoonPanel
              icon={Monitor}
              title="All active devices & remote revocation"
              description="Viewing a list of all signed-in devices, IP metadata, and revoking individual sessions remotely will be supported once the session listing endpoint is added."
              detail="Tip: Updating your password above immediately revokes all other active sessions."
            />
          </CardContent>
        </Card>

        {/* Danger Zone — Account Deactivation */}
        <Card className="border-red-200/80">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <ShieldAlert
                className="h-4.5 w-4.5 text-red-700"
                aria-hidden="true"
              />
              <CardTitle className="text-red-900">Deactivate account</CardTitle>
            </div>
            <CardDescription>
              Permanently deactivate your ClearLedger account, revoke all
              sessions, and remove your personal profile details. Ownership of
              active multi-member groups transfers automatically to the longest
              standing eligible member; sole-member groups are archived.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructiveOutline"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Deactivate my account
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog for Account Deactivation */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm account deactivation</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. Your sessions will
              be revoked immediately and your personal details will be erased.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={deleteForm.handleSubmit(onDeleteSubmit)}
            noValidate
            className="mt-4 space-y-4"
          >
            {deleteAccountMutation.error && (
              <Alert variant="error">
                {getErrorMessage(deleteAccountMutation.error)}
              </Alert>
            )}

            <FormField
              id="delete-account-password"
              label="Current password"
              error={deleteForm.formState.errors.currentPassword?.message}
              required
            >
              <Input
                id="delete-account-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                hasError={Boolean(deleteForm.formState.errors.currentPassword)}
                {...deleteForm.register("currentPassword")}
              />
            </FormField>

            <FormField
              id="delete-account-confirm"
              label='Type "DELETE" to confirm'
              error={deleteForm.formState.errors.confirmationText?.message}
              required
            >
              <Input
                id="delete-account-confirm"
                placeholder="DELETE"
                hasError={Boolean(deleteForm.formState.errors.confirmationText)}
                {...deleteForm.register("confirmationText")}
              />
            </FormField>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDeleteDialogOpenChange(false)}
                disabled={deleteAccountMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                isLoading={deleteAccountMutation.isPending}
              >
                Deactivate account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
