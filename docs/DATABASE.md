# MATCHDAY database

PostgreSQL (Supabase). All schema changes live in `supabase/migrations/` and are applied in
filename order. Never edit the schema from the dashboard.

| Migration | Contents |
|---|---|
| `…01_core_schema.sql` | Enums and every table, constraint and index |
| `…02_helpers_and_rls.sql` | Helper functions, triggers, append-only audit, rate limiter, **RLS policies**, column grants |
| `…03_social_and_groups.sql` | Notifications, friends, blocks, invite links/QR, groups, roles, seasons, moderation |
| `…04_sessions.sql` | Sessions, RSVP/waiting list, check-in, verification, fixtures, line-ups, scores, goals, voting, templates |
| `…05_statistics.sql` | Finalisation, MOTM, derived stats, achievements, leaderboards, records, H2H, Wrapped, seasons, deadline processor |
| `…06_payments_storage_realtime.sql` | Payment helpers and status-change trigger, storage buckets/policies, realtime publication, function grants |
| `…07_scheduler.sql` | Schedules `process_session_deadlines()` every 15 min with pg_cron when available |
| `…08_add_group_members.sql` | Add friends to a group directly |
| `…09_promote_waitlist_on_capacity.sql` | Raising a session's capacity promotes the waiting list |
| `…10_rsvp_removed.sql` / `…11_guests_removal_assists.sql` | Host removal of players (rejoin only when re-invited), session guests and guest requests, goals + assists cap, host goal self-approval |

## Entity overview

```
auth.users ─1:1─ profiles ─1:1─ user_preferences
                 │  ├─ friend_requests / friendships (user_a < user_b) / user_blocks / push_tokens
                 │  └─ invite_links (friend | group | session; QR codes)
groups ─1:1─ group_settings
  ├─ group_members (role: owner | admin | moderator | member; one owner per group)
  ├─ group_join_requests
  └─ seasons ─ season_awards
sessions (host, optional group, template, season)
  ├─ session_hosts (co-hosts)        ├─ session_invitations
  ├─ session_attendance (RSVP, waiting list, check-in, host verification, late, replacement)
  ├─ fixtures ─ fixture_teams (A/B, name, colour, score) ─ team_players (position, GK, sub)
  ├─ goal_submissions ─ goal_reviews (append-only)      player_goals (official, per fixture or session)
  ├─ player_ratings (unique rater→ratee)                 motm_votes (unique per voter per session/fixture)
  ├─ motm_awards                                         session_player_statistics (derived)
  └─ payments ─ payment_events (webhook idempotency) / refunds / payout_records
player_achievements (unique per user+code) ← achievements (catalogue)
activity_feed ─ comments (threaded) / reactions
notifications (push_status / email_status queues)
reports / moderation_actions / audit_logs (append-only) / rate_limits
```

Adjustments relative to the original brief:

* `session_waitlist` is modelled as `session_attendance.status = 'waitlisted'` + `waitlisted_at` (FIFO) — one row per player per session avoids two sources of truth.
* `teams` / `fixture_results` are `fixture_teams` (team per fixture, with its score); players can change team between fixtures.
* `player_goals` and `player_assists` are a single `player_goals` table with `goals` and `assists` columns.
* `goal_approvals` is `goal_reviews` (append-only trail of approve / reject / correct / clarify).
* `group_records` is computed on demand by `get_group_records()` from verified data, so it can never drift.
* `group_season_members` is derivable from `session_player_statistics.season_id` and is not stored.

## Statistical integrity

* **Only verified data counts.** `session_player_statistics` rows are produced exclusively by
  `compute_session_statistics(session)` from: finalised sessions, attendance with
  `verification = 'verified'`, played fixtures, approved `player_goals`, ratings exchanged between
  verified participants, and `motm_awards`.
* The function is **idempotent** (delete + insert) and doubles as the reconciliation tool
  (`reconcile_session`). Totals are never edited directly; career and group stats are
  `security_invoker` views/aggregates over those rows.
* **Session vs fixture appearances:** a multi-fixture session is one row (`sessions` appearance) with
  `fixtures_played`, `wins`, `draws`, `losses` counted per fixture.
* **Ratings:** a session rating is the mean of valid ratings received; it is *eligible* only when
  the count reaches `min_ratings_required(participants)` (40 % of the other players, clamped 2–5;
  1 for two-player games; group override available). The **career rating weights every eligible
  session equally** (mean of session means).
* **MOTM:** highest valid vote total; ties are shared unless the host explicitly picks one of the tied
  players (audited). No votes → no award.
* **Goal claims are validated** against recorded scores (per fixture and per session): a player's
  goals + assists can never exceed their team's goals, and approvals are rejected if they would credit
  more goals or assists than were scored. Hosts' own claims are approved automatically (still capped,
  logged in `goal_reviews` and `audit_logs`).
* **Guests** (`session_guests`) take squad spots and can be picked in line-ups (`team_players.guest_id`)
  but never receive statistics or votes. If the host removes a member's guest, that member's further
  guests become requests (one pending at a time) that the host approves.
* **Corrections after finalisation** go through `correct_session` (score / attendance) or late goal
  approval; both recompute statistics and write an audit entry with before/after.

## Security model

* RLS is enabled on every table. Reads are scoped by relationship (self, friends, group membership,
  session participation, visibility, blocks). Writes that affect other players or statistics are only
  possible through `SECURITY DEFINER` RPCs that validate the caller inside one transaction.
* Votes and ratings are anonymous: `select` policies return only the caller's own ballots; tallies are
  only exposed to hosts after voting closes.
* `audit_logs` and `goal_reviews` are append-only (update/delete triggers raise).
* Column-level grants stop clients editing protected profile/group fields.
* Internal helpers (`notify`, `compute_session_statistics`, …) have `EXECUTE` revoked from clients.
* `check_rate_limit` throttles friend requests, invites, reports, group/session creation and goal submissions.

## Key RPCs (called from the app)

| Area | Functions |
|---|---|
| Identity | `is_username_available`, `complete_onboarding`, `search_users`, `register_push_token`, `mark_notifications_read` |
| Friends | `send_friend_request`, `respond_friend_request`, `cancel_friend_request`, `remove_friend`, `block_user`, `unblock_user` |
| Invites | `create_invite_link`, `get_invite`, `accept_invite` |
| Groups | `create_group`, `join_group`, `decide_join_request`, `set_member_role`, `transfer_group_ownership`, `remove_group_member`, `create_season`, `finalise_season` |
| Sessions | `create_session`, `update_session`, `cancel_session`, `invite_to_session`, `add_co_host`, `respond_to_session`, `check_in`, `set_attendance_verification`, `add_session_player`, `start_session`, `complete_session` |
| Templates | `save_session_as_template`, `create_session_from_template`, `duplicate_session` |
| Fixtures | `add_fixture`, `delete_fixture`, `save_lineup`, `record_fixture_score`, `get_player_strengths`, `get_recent_pairings` |
| Goals | `submit_goals`, `review_goal_submission`, `bulk_approve_goals`, `host_record_goals` |
| Voting | `get_voting_state`, `cast_motm_vote`, `submit_ratings`, `close_voting`, `get_motm_tally`, `finalise_session` |
| Stats | `get_home_dashboard`, `get_pending_tasks`, `get_player_profile`, `get_head_to_head`, `get_leaderboard`, `get_group_records`, `get_wrapped`, `correct_session`, `reconcile_session` |
| Payments | `get_session_payment_statuses`, `get_payment_summary`, `record_cash_payment`, `mark_host_confirmed` |
| Moderation | `report_content`, `resolve_report`, `delete_comment` |

## Tests

`npm run test:db` recreates a throwaway database on a local PostgreSQL, loads a small stub of the
Supabase platform schemas (`supabase/tests/auth_stub.sql` — `auth.uid()`, roles, storage), applies all
migrations and runs `tests/db/*.test.ts` **as the `authenticated` role with JWT claims**, exactly like
PostgREST. Suites: `journey` (end-to-end single and multi-fixture flows, seasons, scheduler,
recurrence), `security` (RLS and permission checks), `coverage` (every remaining RPC).
