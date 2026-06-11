# appstore-connect-skill

A Claude Skill, currently in design phase, for App Store Connect workflows.

## Development

Prerequisites: Node.js >= 22.12.

```sh
npm ci          # install dependencies from the committed lockfile
npm run check   # typecheck + lint + format check + tests (same gate as CI)
```

Individual scripts: `typecheck`, `lint`, `format`, `format:check`, `test`,
`test:watch`, `coverage`, `build`.
