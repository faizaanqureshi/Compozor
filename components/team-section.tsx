"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, ChevronDown, Loader2, Mail, UserPlus } from "lucide-react";

import {
  ApiError,
  Team,
  TeamMember,
  TeamRole,
  changeTeamMemberRole,
  getTeam,
  inviteTeamMember,
  removeTeamMember,
  revokeTeamInvitation,
} from "@/lib/api";
import { teamKey } from "@/lib/swr-keys";
import { Panel } from "@/components/panel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLES: { value: TeamRole; label: string; description: string }[] = [
  { value: "member", label: "Member", description: "Works with clients, documents, emails and workflows." },
  { value: "admin", label: "Admin", description: "Also manages billing, mailboxes, firm settings and the team." },
];

const roleLabel = (role: TeamRole) => (role === "admin" ? "Admin" : "Member");

function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(member: TeamMember) {
  const source = member.name || member.email || "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (member.name ? parts[1]?.[0] ?? "" : "")).toUpperCase() || "?";
}

function RoleMenu({
  member,
  busy,
  onChangeRole,
  onRemove,
}: {
  member: TeamMember;
  busy: boolean;
  onChangeRole: (role: TeamRole) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="font-normal text-muted-foreground" disabled={busy} aria-label={`Role for ${member.name ?? member.email}`} />
        }
      >
        {busy ? <Loader2 className="animate-spin" /> : null}
        {roleLabel(member.role)}
        <ChevronDown className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {ROLES.map((role) => (
          <DropdownMenuItem
            key={role.value}
            onClick={() => role.value !== member.role && onChangeRole(role.value)}
            className="items-start py-2"
          >
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {role.value === member.role && <Check />}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{role.label}</span>
              <span className="text-xs text-muted-foreground">{role.description}</span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <span className="size-4 shrink-0" />
          Remove from firm
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MemberRow({
  member,
  isAdmin,
  busy,
  onChangeRole,
  onRemove,
}: {
  member: TeamMember;
  isAdmin: boolean;
  busy: boolean;
  onChangeRole: (role: TeamRole) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar>
        {member.image_url && <AvatarImage src={member.image_url} alt="" />}
        <AvatarFallback className="text-xs">{initials(member)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {member.name ?? member.email}
          {member.is_you && <span className="font-normal text-muted-foreground"> · You</span>}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {member.name && member.email ? member.email : null}
          <span className="sm:hidden">{member.name && member.email ? " · " : ""}{roleLabel(member.role)}</span>
        </span>
      </div>
      <span className="hidden shrink-0 text-xs text-muted-foreground md:block">Joined {shortDate(member.joined_at)}</span>
      <div className="hidden w-28 shrink-0 justify-end sm:flex">
        {isAdmin && !member.is_you ? (
          <RoleMenu member={member} busy={busy} onChangeRole={onChangeRole} onRemove={onRemove} />
        ) : (
          // Same box as the role menu's trigger (minus its chevron) so roles line up.
          <span className="inline-flex h-8 items-center gap-1 px-3 text-[0.8125rem] text-muted-foreground">
            {roleLabel(member.role)}
            <span aria-hidden className="size-3.5" />
          </span>
        )}
      </div>
      {isAdmin && !member.is_you && (
        <div className="sm:hidden">
          <RoleMenu member={member} busy={busy} onChangeRole={onChangeRole} onRemove={onRemove} />
        </div>
      )}
    </li>
  );
}

function InviteDialog({
  open,
  firmName,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  firmName: string;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setRole("member");
    setError(null);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    try {
      await inviteTeamMember({ email: email.trim(), role });
      reset();
      onInvited();
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (sending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={send} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>They&apos;ll get an email to join {firmName}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                placeholder="name@yourfirm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <NativeSelect id="invite-role" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.value === role)?.description}</p>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={sending || !email.trim()}>
              {sending && <Loader2 className="animate-spin" />}
              {sending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Settings -> Team. Everyone sees who's in the firm; admins invite people,
// change roles and remove access. Seats count pending invitations too.
export function TeamSection({ firmName, isAdmin }: { firmName: string; isAdmin: boolean }) {
  const { data: team, error: loadError, mutate } = useSWR<Team>(teamKey(), getTeam);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  const full = !!team && team.seats_used >= team.seat_limit;

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await mutate();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    if (await run(removing.user_id, () => removeTeamMember(removing.user_id))) setRemoving(null);
  };

  return (
    <>
      <Panel
        title="Team"
        meta={team?.enabled ? `${team.seats_used} of ${team.seat_limit} seats` : undefined}
        loadError={loadError ? errorMessage(loadError) : null}
        action={
          isAdmin && team?.enabled ? (
            <Button variant="ghost" size="sm" disabled={full} onClick={() => setInviting(true)}>
              <UserPlus />
              Invite
            </Button>
          ) : undefined
        }
      >
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!team ? (
          <Skeleton className="h-28 w-full rounded-lg" />
        ) : !team.enabled ? (
          <p className="text-sm text-muted-foreground">
            Shared team access isn&apos;t switched on for this firm yet. Your work stays as it is.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <ul className="flex flex-col divide-y divide-border/60 rounded-lg ring-1 ring-foreground/10">
              {team.members.map((member) => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  isAdmin={isAdmin}
                  busy={busyId === member.user_id}
                  onChangeRole={(role) => void run(member.user_id, () => changeTeamMemberRole(member.user_id, role))}
                  onRemove={() => setRemoving(member)}
                />
              ))}
            </ul>

            {team.invitations.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">Pending invitations</h3>
                <ul className="flex flex-col divide-y divide-border/60 rounded-lg ring-1 ring-foreground/10">
                  {team.invitations.map((invitation) => (
                    <li key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                        <Mail className="size-3.5" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">{invitation.email}</span>
                        <span className="text-xs text-muted-foreground">
                          {roleLabel(invitation.role)} · Invited {shortDate(invitation.invited_at)}
                        </span>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          disabled={busyId === invitation.id}
                          onClick={() => void run(invitation.id, () => revokeTeamInvitation(invitation.id))}
                        >
                          {busyId === invitation.id ? "Revoking…" : "Revoke"}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isAdmin ? (
              <p className="text-xs text-muted-foreground">Only firm admins can invite people or change roles.</p>
            ) : full ? (
              <p className="text-xs text-muted-foreground">
                All {team.seat_limit} seats are in use. Remove someone or revoke an invitation to invite more.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      <InviteDialog open={inviting} firmName={firmName} onOpenChange={setInviting} onInvited={() => void mutate()} />

      <Dialog open={removing !== null} onOpenChange={(open) => !open && busyId === null && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name ?? removing?.email}?</DialogTitle>
            <DialogDescription>
              They&apos;ll lose access to {firmName} right away. Clients, emails and work they handled stay with the firm.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busyId !== null} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busyId !== null} onClick={() => void confirmRemove()}>
              {busyId !== null ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
