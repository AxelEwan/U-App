# WeChat Mini Program build

The source app is Taro TypeScript and intentionally does not contain a handwritten `app.json`. Taro generates the Mini Program files into `dist/`.

```bash
pnpm dev:weapp
# or: pnpm build:weapp
```

In WeChat DevTools, open exactly:

```text
apps/client/dist
```

That directory contains the generated `app.json` and `project.config.json`. Do not open the repository root or `apps/client` before running a Weapp build. `touristappid` is a development placeholder; configure a real AppID only in a local, uncommitted DevTools config when one is issued.
