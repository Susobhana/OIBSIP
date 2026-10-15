# Forma — Login Authentication System

A responsive login and registration experience created for the Oasis Infobyte Web Development Internship (OIBSIP) Level 2 project.

## Run locally
1. Extract the ZIP archive.
2. Open `OIBSIP_Login_Authentication/index.html` in a current browser.
3. Select **Create account**, register a demo account, and then sign in.

## Features
- Responsive, static split-screen authentication design with editorial styling.
- Login and registration modes with clear navigation.
- Inline email, name, password, and confirmation validation with accessible error announcements and invalid-field state.
- Show/hide password controls and live registration password-strength feedback.
- Duplicate-account prevention and personalised signed-in screen.
- Local-demo password reset flow (does not send email).
- Dashboard navigation for Overview, Security Guide, and Your Profile.
- Remember-session option, logout, accessible status toasts, and keyboard-friendly reset dialog controls.
- Custom inline SVG brand mark and geometric hero illustration, matching SVG favicon, violet/plum palette, warm champagne accents, and static visual details.
- Motion effects and custom cursor effects disabled; visual impact comes from composition, SVG artwork, contrast, and typography.
- Mobile-responsive layout and keyboard Escape/backdrop close for the reset dialog.

## QA and verification
- JavaScript syntax check: passed with Node.js `--check`.
- HTML parser check: passed.
- Duplicate HTML ID check: none found.
- Referenced local asset check: passed for local `href`/`src` references.
- ZIP integrity check: run on the delivered archive.
- Automated browser interaction test: attempted, but the execution environment blocked Chromium navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`; registration/login/reset/logout and visual behavior should therefore be manually verified in a browser before submission.

## Important security note
This is a **front-end portfolio demonstration**, not production authentication. Demo accounts and passwords are stored in this browser's `localStorage`; they are not securely hashed, and the password-reset flow is local-only. Never use a real password or sensitive personal information. Production authentication requires a backend, HTTPS, secure password hashing (such as Argon2id or bcrypt), server-managed sessions, rate limiting, CSRF protections where applicable, and a verified email reset flow.

## Data reset
To clear demo accounts and sessions, clear this site's local storage in browser developer tools. This also removes saved demo account data.
