{{> greeting}}

## About

This is {{name}}, version {{version}}.

{{description}}

{{#if show_advanced}}
## Advanced Details

This section is only shown when `show_advanced` is true.
{{else}}
## Basic Mode

This section is shown when `show_advanced` is false or absent.
{{/if}}

{{> suite-specific}}
