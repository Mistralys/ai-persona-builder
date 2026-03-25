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

Suite-local partials override shared partials with the same name.
