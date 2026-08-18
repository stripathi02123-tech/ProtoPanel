// Shared "can this user touch this server" check.
//
// Before this, ownership was checked ad hoc in a handful of controller
// functions (getServer, updateIpAlias, deleteServer) and NOT checked at
// all in most of them — including every file manager endpoint and the
// WebSocket joinServer handler, which joined a user to a server's log
// room based on nothing but the server ID they sent. This centralizes
// the rule so it can be enforced consistently in both places.
//
// Sub-user permission granularity (per-action scopes) is a bigger,
// separate piece of work — tracked as a follow-up, not part of this
// pass. For now, any listed sub-user is treated as having access; this
// still closes the "any authenticated user can touch any server" gap,
// which is the acute issue.

export interface AuthUser {
  id: string;
  role?: string;
  [key: string]: any;
}

export interface ServerRecord {
  id: string;
  owner?: string;
  subUsers?: { userId: string; permissions?: string[] }[];
  [key: string]: any;
}

export function isPrivilegedRole(user: AuthUser | undefined | null): boolean {
  return !!user && (user.role === "admin" || user.role === "owner");
}

export function findSubUserEntry(server: ServerRecord | undefined | null, userId: string) {
  if (!server || !Array.isArray(server.subUsers)) return null;
  return server.subUsers.find((su) => su.userId === userId) || null;
}

/**
 * True if `user` is allowed to access `server` at all (view it, act on
 * it via routes that don't have a stricter role requirement of their
 * own). Admin/owner-role users can access everything; otherwise the
 * user must own the server or be listed as one of its sub-users.
 */
export function canAccessServer(user: AuthUser | undefined | null, server: ServerRecord | undefined | null): boolean {
  if (!user || !server) return false;
  if (isPrivilegedRole(user)) return true;
  if (server.owner === user.id) return true;
  return !!findSubUserEntry(server, user.id);
}
