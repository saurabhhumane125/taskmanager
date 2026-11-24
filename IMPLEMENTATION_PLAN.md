# Taskflow implementation plan

## Design
One responsive workspace: a dark green sidebar, white task cards, quiet green accents, and a clear New task action. Three summary cards show total, active, and completed tasks. Use an honest empty state on first launch, with no invented user data.

## Scope
Create a task with a title, optional description and due date, and priority. Edit, complete, reopen, and delete tasks. Search, filter by status or due today, and sort. Confirm deletions. Support keyboard navigation, mobile screens, loading indicators, and visible API errors.

## Implementation
1. React and Vite frontend with plain CSS and Lucide icons.
2. Express REST API: GET/POST `/api/tasks`, PATCH/DELETE `/api/tasks/:id`.
3. MongoDB with Mongoose when MONGODB_URI is configured. An explicit local JSON demo mode allows immediate use without a database installation; it is not MongoDB.
4. Validate input on the API and save data before confirming UI changes.
5. Verify API behavior, persistence, and production compilation. Document startup and a short presentation walkthrough.

## Accounts and deployment
Email/password signup and login protect each workspace. Passwords use salted scrypt hashes. Login sessions use opaque random tokens in HttpOnly cookies, with hashed session tokens and expiration stored in the database. Production cookies are Secure; API mutations require a same-origin custom header and reject cross-site requests. Database-backed attempt counters limit authentication requests across Vercel instances.

All task operations filter by the authenticated owner. Legacy shared tasks without an owner remain in storage and are hidden from accounts. Vercel serves the frontend and API using MongoDB Atlas. No extra authentication environment secret is needed.

## Deliberate limits
No email verification, password-reset email, team sharing, or notifications. This version provides a separate workspace per account, not collaboration.
