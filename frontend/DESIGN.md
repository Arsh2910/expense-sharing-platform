# SplitCircle design contract

SplitCircle helps groups understand shared expenses and take the next action with confidence. Put real balances, group names, and tasks ahead of decoration.

- Use warm neutral backgrounds, white surfaces, dark ink, and deep teal for primary actions. Reserve semantic colors for meaningful status and always pair color with text.
- Keep typography legible and purposeful. Use tabular numbers for amounts, clear headings, and compact supporting labels.
- Align controls consistently; buttons center their contents and maintain visible keyboard focus and disabled states.
- Use modest radii, subtle borders and shadows. Group related information through spacing before adding containers.
- On small screens stack content, retain access to navigation and actions, and avoid horizontal overflow.
- Preserve real data, existing routes, forms, API behavior, and loading, empty, error, and success states.
- Verify representative desktop and mobile screens and important interactions before declaring the redesign complete.

The overview leads with a balance summary for each currency, then uses an uneven grid for recent groups and invitations. Recent activity sits below as a chronological list. On phones the sections stack in reading order. Use actual query results for counts and group rows.

The overview sums existing per-group net balances in integer minor units. It shows open group balances and keeps currencies separate. It does not imply that net balances identify specific counterparties or scheduled payments. Recent activity combines the latest page from each group, with full history available in each group.

The group list uses the same balance data to show the signed-in member’s position and the active member count. The desktop rail can collapse. Mobile uses bottom navigation and a bottom sheet for choosing where to add an expense.

Light mode uses warm paper-like surfaces. Dark mode uses charcoal surfaces with lighter panels and soft teal for actions. A stored preference applies across the app, with the operating system preference as the default.
