# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in BAU Suite, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer directly with details of the vulnerability
3. Include steps to reproduce the issue
4. Allow reasonable time for a fix before public disclosure

## Scope

This policy applies to:
- The BAU Suite web application
- The Tauri desktop application
- The cloud sync infrastructure (Supabase)

## Security Measures

- All user data is stored locally in IndexedDB by default
- Cloud sync uses Supabase with Row Level Security (RLS)
- Authentication handled by Supabase Auth
- CSP headers configured for both web and desktop modes
- File downloads use sanitized filenames
- Markdown rendering sanitized with DOMPurify
