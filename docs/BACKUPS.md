# Database backups (free plan)

The Supabase free plan has no automatic backups, so a GitHub Action makes one every Monday
(`.github/workflows/backup.yml`). Each backup is **encrypted** with your passphrase and kept for **90 days**
under GitHub → Actions → "Weekly database backup" → a run → **Artifacts**.
When you move to Supabase Pro you get daily backups too; this can keep running as an extra copy.

## One-time setup (GitHub → repository → Settings → Secrets and variables → Actions → New repository secret)

1. **`SUPABASE_DB_URL`** – Supabase → **Connect** (top bar) → **Session pooler** → copy the URI and put your
   database password in place of `[YOUR-PASSWORD]`. Use the *Session pooler* one (GitHub can't reach the direct one).
   Forgot the database password? Supabase → Project Settings → Database → **Reset database password**
   (nothing in the app uses it, so resetting is safe).
2. **`BACKUP_PASSPHRASE`** – a long passphrase only you know. **Store it in your password manager**:
   without it the backups can't be opened.

Then Actions → "Weekly database backup" → **Run workflow** to test it. A green tick and an artifact = working.

## Restoring (rarely needed – ask for help)

1. Download the artifact (a .zip) and unzip it to get `matchday-backup-YYYY-MM-DD.tar.gz.gpg`.
2. Decrypt: `gpg -d matchday-backup-YYYY-MM-DD.tar.gz.gpg > backup.tar.gz` and extract it
   (`tar xzf backup.tar.gz`) → `roles.sql`, `schema.sql`, `data.sql`.
3. Restore into a Supabase project with `psql` following Supabase's guide "Backup and restore using the CLI".

Note: GitHub pauses scheduled workflows in repositories with no activity for 60 days; if that happens,
re-enable it from the Actions tab.
