# Homepage and early access

The homepage explains communication, collection, document checks, and workflows with work samples. All people, firms, and amounts in its product illustrations are fictional. The illustrations are not live workflow runs or execution-speed claims.

## Public journeys

- `/demo` redirects to `https://cal.com/faizaan-qureshi/30min`. Booking does not require or create a Compozor account.
- `/waitlist` hosts Clerk's waitlist, styled with the existing design tokens. Clerk stores entries and handles confirmation/invitation emails. Joining does not create an application organization.
- `/sign-in` remains available for existing accounts. The marketing navigation displays Dashboard when signed in.
- `/sign-up` still hosts the consent gate and Clerk sign-up component. Valid invitations must be able to complete this route.
- `/upload/[token]` remains public and bypasses the app shell/onboarding, as do the homepage and waitlist.

## Required Clerk setting

Set **Access mode → Waitlist** on the Clerk instance used by the deployment. This is the actual registration restriction, including hosted account pages and OAuth sign-up. Removing a signup link alone is not access control. Email authentication must remain enabled for invitations.

On September 21, 2026, the Compozor instance used by both the local frontend and the live homepage (`bold-pup-67.clerk.accounts.dev`) was changed from Open to Waitlist. Existing accounts remain valid. Joining the waitlist does not automatically approve a user; approve/invite prospects from Clerk's Waitlist dashboard. New developers also need an invitation. Existing users are not revoked by this setting.

The frontend's ClerkProvider supplies `/waitlist`, `/sign-in`, and `/sign-up` URLs. Preserve these and the consent flow when changing auth settings. If the project moves to a separate production Clerk instance, configure Waitlist mode there before deploying. Never commit secret keys.

Docs: https://clerk.com/docs/guides/secure/restricting-access

## Release checks

Verify the homepage at mobile, tablet, and desktop widths. Check the process tabs, sample/report switch, FAQ, section anchors, and mobile navigation. Verify the Cal.com destination and signed-out waitlist form. Existing accounts must retain dashboard access; uninvited sign-up must be rejected by Clerk. Preserve invited sign-up and public client-upload links.
