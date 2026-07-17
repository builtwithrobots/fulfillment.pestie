/**
 * Standard result shape for server actions across the app: `{ ok: true }`
 * (with `data` when the action returns something) or `{ ok: false, error }`
 * with a user-facing message.
 */
export type ActionResult<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string }
