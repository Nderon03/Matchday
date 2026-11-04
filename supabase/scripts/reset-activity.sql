-- RESET ACTIVITY, KEEP ACCOUNTS — e.g. after the closed test, before the public launch.
-- Keeps: every account and profile, sign-ins, Stripe payout setups (payment_accounts), push tokens,
--        notification/privacy settings, and the "MATCHDAY Review FC" group used by Google's reviewers.
-- Removes: all other groups, all sessions (line-ups, scores, goals, votes, ratings, stats, videos,
--          guests, fines, payment records), achievements, activity feed and notifications.
-- Optional block at the bottom also clears friendships.
--
-- BEFORE RUNNING:
--   1. GitHub → Actions → "Weekly database backup" → Run workflow (fresh backup).
--   2. Make sure no payments are mid-way (no upfront card holds, no refunds waiting).
--      Stripe keeps its own records of every payment; only MATCHDAY's copy is removed.
--   3. Tell your testers their test games and stats are being cleared.

begin;

-- sessions outside the review group (cascades to everything attached to a session)
delete from public.player_achievements
 where session_id in (
   select s.id from public.sessions s left join public.groups g on g.id = s.group_id
    where g.name is distinct from 'MATCHDAY Review FC'
 );
delete from public.sessions s
 where not exists (select 1 from public.groups g where g.id = s.group_id and g.name = 'MATCHDAY Review FC');

-- groups other than the review group (cascades to memberships, seasons, invites, settings, fines)
delete from public.groups where name <> 'MATCHDAY Review FC';

-- achievements earned anywhere else, feed and notifications
delete from public.player_achievements
 where session_id is null
   and user_id not in (select gm.user_id from public.group_members gm join public.groups g on g.id = gm.group_id where g.name = 'MATCHDAY Review FC');
delete from public.activity_feed where group_id is null or group_id not in (select id from public.groups);
delete from public.notifications;

-- OPTIONAL: also clear friendships and friend requests (uncomment both lines)
-- delete from public.friendships;
-- delete from public.friend_requests;

commit;

-- Check: accounts kept, activity cleared
select (select count(*) from auth.users)               as accounts_kept,
       (select count(*) from public.payment_accounts)  as payout_setups_kept,
       (select count(*) from public.groups)            as groups_left,      -- 1 (review group)
       (select count(*) from public.sessions)          as sessions_left,    -- only the review group's
       (select count(*) from public.session_player_statistics) as stats_left;
