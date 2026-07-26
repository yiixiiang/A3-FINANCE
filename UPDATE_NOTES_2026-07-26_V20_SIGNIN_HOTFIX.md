# FINANCE1 V20 — Sign-in hotfix

- Valid A3 User Access credentials no longer get blocked by an unavailable or incomplete Supabase connection.
- Supabase authentication and hydration are attempted during login, but cloud errors remain non-blocking.
- The header Cloud Status indicator continues to show Connected, Signed Out, or Error.
- Initial administrator recovery remains `admin` / `admin123`.
- Login copy no longer implies that Supabase must be ready before local access is allowed.
