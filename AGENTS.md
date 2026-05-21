# Repository Guidelines

## Shell & Command Format
The current working shell is PowerShell. When running commands or writing examples, use PowerShell syntax and PowerShell-compatible path separators, quoting, and pipelines. Avoid Bash-specific constructs unless they are explicitly required and already wrapped for PowerShell.

## Project Structure & Module Organization
`src/` contains the Vue 3 + TypeScript front end. Main UI entry points are `src/main.ts` and `src/App.vue`, with feature code grouped under `src/components/`, `src/services/`, and `src/utils/`. Test files live in `src/__tests__/` and follow Vitest naming. Static assets belong in `public/` or `src/assets/`. The desktop shell and Rust bridge live in `src-tauri/`, including Tauri config, icons, and bundled MaaFramework artifacts.

## Build, Test, and Development Commands
Use `pnpm install` to install dependencies.

- `pnpm dev`: start the Vite web dev server.
- `pnpm tauri:dev`: run the full desktop app in Tauri development mode.
- `pnpm build`: run type-checking and produce a production web build.
- `pnpm tauri:build`: create the desktop installer/package.
- `pnpm lint`: run ESLint with autofix across `.vue`, `.ts`, and `.js` files.
- `pnpm type-check`: run `vue-tsc --noEmit`.
- `pnpm test`: run Vitest once.
- `pnpm test:watch`: run Vitest in watch mode.

## Coding Style & Naming Conventions
TypeScript is strict, with `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch` enabled. Follow the existing style: 2-space indentation, single-file Vue components, and `PascalCase` for components such as `FlowEditor.vue` and `NodeDetails.vue`. Use `camelCase` for functions, variables, and composables. Prefer the `@/` alias for imports from `src/`. Keep Tailwind utility classes and shared classes in `src/assets/styles/tailwind.css` consistent with the current `btn-*` and `input-base` patterns.

## Testing Guidelines
Vitest runs in `jsdom` and picks up files matching `src/**/*.{test,spec}.{js,ts}`. Keep tests close to the behavior they verify, and use fixtures under `src/__tests__/fixtures/` when sample data is needed. New UI or transformation work should include a focused test for the affected utility or component behavior.

## Commit & Pull Request Guidelines
Recent history uses short conventional prefixes like `feat:`, `fix:`, `test:`, and `chore:` followed by a brief description, often in Chinese. Keep commits scoped to one change. Pull requests should summarize the user-visible effect, list validation steps, and include screenshots or short screen recordings for UI changes. Link related issues when applicable.

## Security & Configuration Notes
Do not commit local build output from `dist/` or Rust `target/` directories. Tauri changes may require Windows-specific validation because the app currently targets Windows packaging and bundled MaaFramework binaries.
