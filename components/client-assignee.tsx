"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAuth } from "@clerk/nextjs";

import { ApiError, getTeam, setClientAssignee, type Client, type TeamMember } from "@/lib/api";
import { clientsKey, teamKey } from "@/lib/swr-keys";
import { useIsFirmAdmin } from "@/lib/use-firm-role";
import { NativeSelect } from "@/components/ui/native-select";

function memberName(member: TeamMember) {
  return member.name || member.email || "Team member";
}

// "Assigned to" on the client's Details card. The assigned person's own
// mailbox (when connected) sends this client's email.
export function ClientAssignee({ client, onChanged }: { client: Client; onChanged: () => void }) {
  const { userId } = useAuth();
  const isAdmin = useIsFirmAdmin();
  const { data: team } = useSWR(teamKey(), getTeam);
  const { mutate } = useSWRConfig();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = team?.members ?? [];
  const assignee = members.find((m) => m.user_id === client.assigned_user_id);

  const save = async (value: string) => {
    setSaving(true);
    setError(null);
    try {
      await setClientAssignee(client.id, value || null);
      onChanged();
      void mutate(clientsKey());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const takenBySomeoneElse = !!client.assigned_user_id && client.assigned_user_id !== userId;
  if (!isAdmin && takenBySomeoneElse) {
    return <span>{assignee ? memberName(assignee) : "Another team member"}</span>;
  }
  const options = isAdmin ? members : members.filter((m) => m.user_id === userId);

  return (
    <div className="flex flex-col gap-1">
      <NativeSelect
        aria-label="Assigned to"
        className="max-w-56"
        value={client.assigned_user_id ?? ""}
        disabled={saving}
        onChange={(e) => void save(e.target.value)}
      >
        <option value="">No one</option>
        {options.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.user_id === userId ? `${memberName(m)} (you)` : memberName(m)}
          </option>
        ))}
        {client.assigned_user_id && !assignee && <option value={client.assigned_user_id}>Former team member</option>}
      </NativeSelect>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
