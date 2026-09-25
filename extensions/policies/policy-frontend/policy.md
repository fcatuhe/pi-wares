# Frontend policy

Avoid AI slop UI. Be opinionated and distinctive. Nothing here overrides a palette, font or layout the project already chose.

## Markup

- Semantic HTML first. A native element beats a scripted one: `<details>`, `<dialog>`, `<input type="date">`, `<form>` over a click handler.
- No inline `style` attributes, no inline JS, no `<script>` blocks in templates. Classes, tokens, and script files.
- Label every control, keep focus visible, alt text on meaningful images, contrast that passes at small sizes.

## CSS and JS

- Vanilla CSS and vanilla JS. No jQuery, no lodash, no Tailwind unless the project already uses it.
- Order the cascade with `@layer`, each file wrapping its rules in one layer.

## Look

- Commit to a palette and declare it as CSS variables. Never hardcode a color in a component.
- Spacing and type scale come from tokens, not from numbers typed at the call site.
- Avoid the default look: purple-on-white, the gradient blob hero, the three identical feature cards, the centered everything.
- A webfont has to earn its bytes. If it does not, the system stack is the right answer.

## Motion

One or two high-impact moments. Not micro-animation sprinkled on every element. Respect `prefers-reduced-motion`.

## Weight

Minimal DOM. No library for what CSS does. Every kilobyte ships to someone on a bad connection.
