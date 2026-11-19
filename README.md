# Software Factory Demo

Audience website for Harlan Wilton's talk at AI Engineer Sydney. The feedback form creates labelled GitHub issues in this repo. The Sydney deck embeds a read-only view of issue status and connected pull requests.

- [Demo site](https://ai-engineer.harlanzw.com/)
- [Live submissions](https://ai-engineer.harlanzw.com/board/)
- [Conference session](https://webdirections.org/ai-engineer/speakers/harlan-wilton/)

Run `pnpm install` and `pnpm dev` for local preview. Run `pnpm test`, `pnpm typecheck` and `pnpm build` before opening a PR. The site uses the Cloudflare CLI.

The production Worker needs a fine-grained GitHub token scoped to this repo with Issues read and write and Pull requests read. Store it as the `GITHUB_TOKEN` Worker secret. Keep credentials out of Git and test fixtures.

The projector shows issue numbers and status. It can reveal a selected suggestion title on demand. A PR marked ready or an issue closed without a linked merged PR does not prove a deploy.
