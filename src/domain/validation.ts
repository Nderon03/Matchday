/** Centralised validation shared by forms (and mirrored by database constraints). */
import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(20, 'At most 20 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only');

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

export const emailSchema = z.string().trim().email('Enter a valid email address');

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: z.string().trim().min(1, 'Required').max(40),
});

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Required') });

export const profileSchema = z.object({
  display_name: z.string().trim().min(1, 'Required').max(40),
  bio: z.string().trim().max(280, 'At most 280 characters').optional().or(z.literal('')),
  position: z.enum(['GK', 'DEF', 'MID', 'FWD', 'ANY']),
});

export const groupSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(60),
  description: z.string().trim().max(2000).optional(),
  visibility: z.enum(['public', 'private']),
  join_policy: z.enum(['open', 'request', 'invite_only']),
  location: z.string().trim().max(120).optional(),
  rules: z.string().trim().max(4000).optional(),
});

export const sessionSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the session a name').max(60),
    starts_at: z.date({ message: 'Pick a date and time' }),
    duration_minutes: z.number().int().min(15).max(480),
    location: z.string().trim().max(200).optional(),
    venue: z.string().trim().max(120).optional(),
    postcode: z.string().trim().min(1, 'Add the venue’s postcode so players can find it'),
    format_size: z.number().int().min(5).max(11),
    max_attendance: z.number().int().min(2).max(60),
    visibility: z.enum(['public', 'group', 'private']),
    description: z.string().trim().max(1000).optional(),
    payment_mode: z.enum(['free', 'upfront', 'after']),
    price_pence: z.number().int().min(0).max(10000),
    group_id: z.string().uuid().nullable(),
    invitee_ids: z.array(z.string().uuid()),
  })
  .superRefine((v, ctx) => {
    if (v.payment_mode !== 'free' && v.price_pence < 100) {
      ctx.addIssue({ code: 'custom', path: ['price_pence'], message: 'Paid sessions must be at least £1' });
    }
    if (v.visibility === 'group' && !v.group_id) {
      ctx.addIssue({ code: 'custom', path: ['visibility'], message: 'Choose a group for group-only sessions' });
    }
    if (v.starts_at.getTime() < Date.now() - 86400_000) {
      ctx.addIssue({ code: 'custom', path: ['starts_at'], message: 'Kick-off cannot be more than a day ago' });
    }
  });

export const goalClaimSchema = z.object({
  goals: z.number().int().min(0).max(50),
  assists: z.number().int().min(0).max(50),
});

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Client-side mirror of public.validate_goal_claim for instant feedback. */
export function validateGoalClaim(
  goals: number,
  teamScoresPlayed: number[],
  breakdown?: { goals: number; assists?: number; teamScore: number }[],
  assists = 0,
): string | null {
  const max = teamScoresPlayed.reduce((a, b) => a + b, 0);
  if (goals > max) return `You claimed more goals than your teams scored (${max}).`;
  if (goals + assists > max) return `Goals plus assists can’t be more than your teams scored (${max}).`;
  if (breakdown && breakdown.length) {
    if (breakdown.some((b) => b.goals > b.teamScore)) return 'You claimed more goals in a game than your team scored.';
    if (breakdown.some((b) => b.goals + (b.assists ?? 0) > b.teamScore)) return 'Goals plus assists in a game can’t be more than your team scored.';
    if (breakdown.reduce((a, b) => a + b.goals, 0) !== goals) return 'Your game-by-game goals must add up to your total.';
    const splitAssists = breakdown.reduce((a, b) => a + (b.assists ?? 0), 0);
    if (splitAssists > 0 && splitAssists !== assists) return 'Your game-by-game assists must add up to your total.';
  }
  return null;
}
