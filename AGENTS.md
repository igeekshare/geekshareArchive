<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Deployment requests

Whenever the user asks to deploy, publish, or go live, treat the request as authorization for the complete production-release workflow below and perform it in this order:

1. Run the relevant checks and production build, fixing in-scope failures until they pass.
2. Deploy the current changes to Cloudflare with the repository's production configuration and verify the live deployment.
3. Commit only the changes belonging to the current task and push that commit to the intended GitHub branch.
4. Report the release as stable only after the checks, Cloudflare deployment, live verification, and GitHub push have all succeeded.

A deployment request is not complete if either Cloudflare deployment or GitHub push fails. Continue resolving in-scope failures when possible and report any real blocker instead of describing an unverified release as stable. "Stable" describes a verified release; do not create or move a Git tag named `stable` unless the user explicitly requests that tag.
