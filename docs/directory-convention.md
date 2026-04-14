# Directory Convention

The library expects the following layout inside each suite's `srcDir`:

```
<srcDir>/
├── meta/
│   ├── _shared.yaml        # Shared defaults merged into every persona
│   ├── persona-one.yaml    # Per-persona metadata
│   └── persona-two.yaml
├── content/
│   ├── persona-one.md      # Markdown content template
│   └── persona-two.md
└── partials/
    └── my-partial.md       # Reusable content fragments (optional)
```

Alongside the suite source, you can have a shared partials directory referenced by `BuildConfig.sharedPartialsDir`:

```
shared/
└── partials/
    └── greeting.md
```

Partials are resolved in five layers of increasing precedence:

1. `BuildConfig.partials` — inline partial map (lowest precedence)
2. `sharedPartialsDir` — shared cross-suite partials loaded from disk
3. Suite-local partials — files in `<srcDir>/partials/` (override shared partials with the same stem name)
4. `onPartials` plugin hooks — plugin-injected partials (suite-level, override all file-based partials)
5. `onPersonaPartials` plugin hooks — per-persona overrides (highest precedence of all; isolated to a single persona's render pass)

Later layers overlay earlier ones; a partial name present in multiple layers uses the value from the highest-precedence layer.

See [Custom Variables & Dynamic Partials](dynamic-partials.md) for the full reference.
