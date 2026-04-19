# Changelog

NOTE: Future changes will be published as GitHub release notes at
[github.com/foreverest/bubbles-never-lie/releases](https://github.com/foreverest/bubbles-never-lie/releases).

## 0.1.0 - 2026-04-19

Initial public release of Bubbles Never Lie, a Devvit Web app that lets moderators create playful chart posts from recent subreddit activity.

### Highlights

- Added the **Bubbles Never Lie: New Post** subreddit menu action for moderators, with a post creation form for title, date range, timezone, and duration.
- Added interactive bubble charts for posts, comments, and contributors, with an additional insights panel for top-level counts.
- Added Reddit-style chart tooltips with avatars, relative age labels, voting/comment metrics, comment previews, and media markers for image and GIF comments.
- Added click-through navigation from chart bubbles to posts, comments, and contributor profiles.
- Added chart controls for section switching, zoom, current-user bubble highlighting, and system/light/dark themes.
- Added chart help overlays that explain what each chart is plotting and how to read the bubbles.
- Added responsive inline and expanded-view layouts, with mobile chart sizing and axis-label behavior tuned for Reddit's iframe surface.
- Added Redis-backed caches and scheduled refresh jobs for subreddit posts, comments, contributors, subreddit icons, and short-lived chart API responses.
- Added safer cache reads for larger time ranges, queued comment refresh processing, and user-facing empty/error states while data warms up.
- Added a feedback dialog with GitHub issue, email, and Reddit DM options.
- Added Devvit marketplace README copy and screenshots for posts, comments, contributors, and tooltip behavior.
- Added TypeScript, ESLint, Prettier, and Vitest tooling with focused coverage around date handling, chart data, chart options, preferences, cache behavior, and server-side post configuration.

### Release Notes

This first release turns subreddit activity into explorable bubble charts. Moderators can create a chart post for a recent date range, and the post opens into tabs for posts, comments, contributors, and quick insight counts.

The charts are built for quick community recaps: busy moments are easy to spot, individual bubbles open the underlying Reddit content, and tooltips provide enough context to understand what happened without leaving the chart immediately. The app also includes a warm cache pipeline so recurring chart posts get faster and fuller as the subreddit activity cache fills in.

Fresh installs may need a short warm-up before charts feel complete. Very old date ranges are best-effort because the app is optimized around recent subreddit activity.
