// Permanently deletes the calling user's account. Group ownership is transferred,
// personal data cascades away, and the auth user is removed (requires service role).
import { adminClient, handler, HttpError, json, requireUser } from '../_shared/http.ts';

Deno.serve(handler(async (req) => {
  const { user } = await requireUser(req);
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (confirm !== 'DELETE') throw new HttpError(400, 'confirmation_required', 'Type DELETE to confirm.');
  const admin = adminClient();

  const { count } = await admin.from('payments').select('id', { count: 'exact', head: true }).eq('payer_id', user.id).in('status', ['pending', 'authorised']);
  if (count) throw new HttpError(409, 'payments_in_progress', 'You have payments in progress. Wait for them to complete before deleting your account.');

  const { error: prepErr } = await admin.rpc('prepare_account_deletion', { p_user: user.id });
  if (prepErr) throw prepErr;
  const { data: files } = await admin.storage.from('avatars').list(user.id);
  if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`));
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
  return json({ deleted: true });
}));
