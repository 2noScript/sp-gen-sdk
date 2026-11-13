# Generation SDK

Contract **2**, SDK **0.2.0**. Build independently downloadable Script-Pro generation plugins with one or several providers.

```sh
npm install --save-dev https://github.com/2noScript/sp-gen-sdk/releases/download/v0.2.0/script-pro-generation-sdk-0.2.0.tgz
npx script-pro-plugin-build manifest.json src/index.ts dist/plugin.zip
```

Export a package through `definePlugin` and typed handlers through `defineProvider`. Each provider declares its identity, operations, parameters, approved origins, optional `logoUrl`/`websiteUrl`, and authentication (`NONE`, `API_KEY`, or `BROWSER`). All providers in a package share its version.

Provider-specific login checks, navigation, session interpretation, requests and responses belong to the plugin. The app exposes scoped resources:

- `host.page(script)`: evaluate on the selected profile's declared provider page.
- `host.session('browser.cookies', [url])`: read cookies for a declared provider page origin, including HTTP-only service cookies when needed. This does not grant access to identity-provider domains.
- `host.session('browser.navigate', [url])`: navigate to a declared provider page and wait for loading.
- `host.request({transport:'BROWSER', ...})`: fetch inside the selected browser profile, with browser-managed cookies and session refresh. Browser mode supports normal browser CORS rules and rejects per-request HTTP proxies.
- `host.request({transport:'HTTP', ...})`: use the shared HTTP client. Pass `proxy` explicitly when needed. Credential references are resolved by the host.
- `host.account.fields` and `host.signal`: declared non-secret configuration and cancellation.

The app prefers installed Chrome through Playwright and retains a dedicated persistent profile. The user-authorized startup fallback uses an existing WebView partition and is reported in Settings. Browser sessions are not copied between engines. A submitted provider request is never replayed through another engine.

Browser authentication may declare an `identityProvider` such as `GOOGLE` or `META` for selecting compatible shared profiles. The plugin still verifies service authorization. A Chrome profile is not a cookie export, and browser automation does not guarantee provider acceptance.

Use `createTestHost` for mocked contract/provider tests. Publish the built ZIP as a versioned GitHub Release and include its digest in the signed catalog. Provider code runs in a sandbox with no Node or Electron access.

Contract 2 replaces the host's old provider-specific session operations and `WEBVIEW` authentication/transport labels. Version 1 plugins require an update; a legacy job is not silently sent to a different implementation. Media output remains a final HTTPS URL from a declared origin; streaming/binary handles are not part of this contract.
