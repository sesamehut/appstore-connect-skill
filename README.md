# appstore-connect-skill

A Claude Skill, under construction, for App Store Connect workflows.

## Development

Prerequisites: Node.js >= 22.12.

```sh
npm ci          # install dependencies from the committed lockfile
npm run check   # contract verify + typecheck + lint + format check + tests
                # (same gate as CI)
```

Individual scripts: `typecheck`, `lint`, `format`, `format:check`, `test`,
`test:watch`, `coverage`, `build`.

## API contract

`src/generated/` holds the TypeScript contract generated from Apple's official
App Store Connect OpenAPI spec, plus a manifest recording the spec version,
capture time, and content hashes. Never edit it by hand — `npm run check`
fails on any drift. To regenerate against the latest published spec:

```sh
npm run contract:update   # fetch the latest spec, regenerate, refresh manifest
```

A weekly CI job (`contract:drift`) flags new Apple spec releases.
