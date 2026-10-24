# Frontend policy

Nothing here overrides a palette, font or layout the project already chose.

## Markup

- Use semantic HTML first. Prefer a native element to a scripted one: `<details>`, `<dialog>`, `<input type="date">` or `<form>` instead of a click handler.
- Do not put inline `style` attributes, inline JS or `<script>` blocks in templates. Use classes, tokens and script files instead.
- Label every control and keep focus visible. Give meaningful images alt text, and use contrast that passes at small sizes.
- Keep the DOM small.

## CSS and JS

- Write vanilla CSS and vanilla JS. Do not add jQuery, lodash or Tailwind unless the project already uses them. Never add a library for what CSS can do.
- Order the cascade with `@layer`. Wrap each file's rules in one layer.

## Look

- Choose a palette and declare it as CSS variables. Never hardcode a color in a component.
- Take spacing and type sizes from tokens, not from numbers typed where they are used.
- Avoid the default look: purple on white, a gradient blob hero, three identical feature cards, everything centered.
- Use a webfont only when it is worth its download size. Otherwise use the system font stack.
- Use motion in one or two places, not on every element. Respect `prefers-reduced-motion`.
