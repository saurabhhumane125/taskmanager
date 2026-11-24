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

## Deliberate limits
Single-user internship demo. No authentication, team sharing, notifications, or deployment. Connect MongoDB before describing the running demo as MERN. Do not expose this unauthenticated API publicly.
