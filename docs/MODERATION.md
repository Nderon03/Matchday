# Handling reports

Every report a player makes is emailed to `matchdayenquiries@hotmail.com` within a minute
("MATCHDAY report: …"). Group owners and admins also get an in-app notice for reports in their group,
and can remove players or delete comments themselves. You only need to step in for serious cases,
or when a group's admins don't.

Google Play expects you to act on reports of abuse, so check the inbox and aim to deal with
each one within a couple of days. Everything below is done in **Supabase → SQL Editor**.
Replace the ids (they're in the email, in square brackets).

## 1. See open reports
```sql
select r.created_at, r.target_type, r.reason, rp.username as reporter, r.target_id, r.id as report_id
  from reports r join profiles rp on rp.id = r.reporter_id
 where r.status = 'open' order by r.created_at desc;
```

## 2. Take action (pick what fits)

**Hide a comment**
```sql
update comments set deleted_at = now(), body = '[deleted]' where id = 'COMMENT_ID';
```

**Remove a player from a group** (they can only come back if an admin adds them)
```sql
delete from group_members where group_id = 'GROUP_ID' and user_id = 'USER_ID';
insert into group_removals (group_id, user_id, reason, removed_by) values ('GROUP_ID', 'USER_ID', 'Removed by MATCHDAY after a report', null) on conflict do nothing;
```

**Suspend an account** (they can't sign in again; any open session ends within the hour)
```sql
update auth.users set banned_until = 'infinity' where id = 'USER_ID';
```
To lift it: `update auth.users set banned_until = null where id = 'USER_ID';`

**Delete an account** (very serious or repeated abuse): first run
```sql
select prepare_account_deletion('USER_ID');
```
then Supabase → **Authentication → Users** → find them → **Delete user**.

## 3. Close the report
```sql
update reports set status = 'actioned', resolved_at = now() where id = 'REPORT_ID';   -- you acted
update reports set status = 'dismissed', resolved_at = now() where id = 'REPORT_ID';  -- nothing wrong
```
Optionally reply to the reporter by email to say it's been dealt with (find their email in
Authentication → Users).

## Notes
- The Terms of Use say accounts that seriously or repeatedly break the rules can be suspended or closed,
  and that you'll say why unless the law prevents it: email the person when you suspend or delete them.
- Something illegal (threats of violence, abuse of a child): keep the details and report it to the police.
- Reports are rate limited (20 a day per player) so one person can't flood the inbox.
