// The username rule, shared by client and server code: trim, lowercase, then
// letters, digits, and hyphens only, 1 to 32 characters. Returns null if invalid.
export function parseUsername(input: string): string | null {
  const username = input.trim().toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(username) ? username : null;
}
