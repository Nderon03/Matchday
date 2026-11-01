-- New RSVP state for players the host removed from a session. Kept in its own
-- migration because a new enum value cannot be used in the same transaction.
alter type public.rsvp_status add value if not exists 'removed';
