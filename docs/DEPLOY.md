# Free deployment: Render (website) + Neon (database)

Render's free web service deletes local files when it restarts, so patient data
goes in a free Neon PostgreSQL database, which is kept.

1. Push this folder to a new GitHub repository.
2. Neon (neon.com) -> sign up -> New project -> copy the connection string
   (`postgresql://...neon.tech/neondb?sslmode=require...`).
3. Render (render.com) -> New -> Web Service -> connect the GitHub repo.
   Language: Docker. Instance type: Free. Environment variables:
   - `MEDIPLATE_DATABASE_URL` = the Neon connection string
   - `MEDIPLATE_SECRET_KEY` = output of `openssl rand -hex 32`
   - `MEDIPLATE_ADMIN_EMAIL` = your admin email
   - `MEDIPLATE_ADMIN_PASSWORD` = a strong password
   - `MEDIPLATE_SOLVER_SECONDS_PER_DAY` = `20` (free instances have little CPU)
4. Create Web Service. The first build takes about 5-10 minutes.

Free-tier behaviour: the site sleeps after 15 minutes without visitors and
takes about a minute to wake; making a weekly plan can take 1-2 minutes on the
small free CPU.
