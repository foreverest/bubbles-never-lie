# Bubble Stats

Bubble Stats creates an interactive subreddit post that helps people understand recent post activity at a glance. Pick a date range, publish a chart, and use the bubbles to compare when posts were created, how many upvotes they received, how much conversation they generated, and whether the author's subreddit karma bucket is known.

## What the app does

Bubble Stats turns subreddit posts into a bubble chart:

- Each bubble is one post from the selected date range.
- The left-to-right position shows when the post was created.
- The up-and-down position shows the post's upvote score.
- The bubble size shows how many comments the post received.
- The bubble color reflects the author's relative subreddit karma bucket among authors in the chart when that information is available.
- Gray bubbles mean the author's subreddit karma bucket was not available.

Bubble Stats also includes a comments chart:

- Each bubble is one comment from the selected date range.
- The left-to-right position shows when the comment was created.
- The up-and-down position shows the comment's upvote score.
- Comment bubbles stay small and use the same size.
- Comment bubble color is stable for each parent post.
- Comments from the same parent post stay grouped during hover.

The charts are useful for spotting busy posting periods, posts that drove conversation, posts and comments with unusually high or low vote scores, and patterns around contributors who have known subreddit karma buckets.

## How to create a chart

Use the subreddit menu item named "Create bubble stats post". The app opens a short form where you can enter:

- A post title.
- A start year, month, and day.
- A start hour.
- A timezone.
- A chart length from 1 to 7 days.

The form defaults to the current date, hour 0, the current timezone when available, and a 1-day chart length. When the form is submitted, the app creates a new Reddit post and opens it.

## How to read the chart

Open the new Bubble Stats post and use the tabs at the top:

- Posts: Shows the interactive bubble chart.
- Comments: Shows comments by creation time and upvote score.
- Stats: Shows how many posts matched the selected date range.

On the chart, hover over or tap a bubble to see the post title, author, author avatar when available, approximate age, upvote score, and comment count. Select a bubble to open the original Reddit post.

On the comments chart, hover over or tap a bubble to see the author, upvote score, and a short comment preview. Select a bubble to open the original Reddit comment.

## Data notes

Bubble Stats is designed for recent subreddit activity. It samples the newest subreddit posts, keeps a rolling cache of recent post and author details, and filters that data to the date range you chose. Very old date ranges may not include every historical post.

If the app was just installed or upgraded, a chart may briefly say a cache is warming. Try again shortly. If no posts or comments match the selected range, the chart shows an empty state and suggests trying a wider date range.

The app uses post information that appears in the chart, including title, author name, author avatar when available, creation time, score, comment count, permalink, and an author subreddit karma bucket when available.

The app also caches comment information for the comments chart, including author name, creation time, score, permalink, and a short preview. Parent post IDs determine stable comment group colors.
