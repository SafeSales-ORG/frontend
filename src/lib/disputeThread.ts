import type { DisputeParty, DisputeThreadMessage } from "@/lib/api/types";

/**
 * Whose move it is in a case: anyone the mediator asked for information who
 * hasn't replied yet, otherwise the mediator. Mirrors the backend.
 */
export function waitingOn(
  resolved: boolean,
  messages: Pick<DisputeThreadMessage, "authorRole" | "requestFrom">[],
): DisputeParty[] {
  if (resolved) return [];
  let last = -1;
  messages.forEach((m, i) => {
    if (m.authorRole === "mediator" && m.requestFrom) last = i;
  });
  if (last >= 0) {
    const target = messages[last].requestFrom!;
    const wanted: DisputeParty[] = target === "both" ? ["buyer", "seller"] : [target];
    const after = messages.slice(last + 1);
    const pending = wanted.filter((p) => !after.some((m) => m.authorRole === p));
    if (pending.length) return pending;
  }
  return ["mediator"];
}
