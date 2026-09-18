# AWS CLI v2 Cheatsheet

A single-page, offline reference for the AWS CLI v2: 17 topics, 230+ command cards, each with
the command, a flag breakdown, realistic sample output in a terminal component, IAM permissions,
gotchas and related commands.

- **No backend, no build step, no CDN.** Open `index.html` directly (`file://`) or serve the folder.
- Works on an air-gapped network. The only third-party code is a vendored copy of Prism.js
  (`vendor/prism/`, MIT).
- Dark theme by default (persisted in `localStorage`), light theme, print stylesheet.
- Global search (`/` to focus, `Esc` to clear, `#tag` to match a tag), scrollspy sidebar,
  deep links to every section and card, expand/collapse all, copy-to-clipboard.

## Layout

```
aws-cli/
├── index.html              page shell; loads css, vendor, data files, app
├── css/site.css            all screen styles (theme tokens at the top)
├── css/print.css           print overrides (light, sidebar hidden, cards expanded)
├── js/registry.js          AWSCHEAT.register() — the tiny registry data files call
├── js/app.js               rendering, search, scrollspy, theme, clipboard, PNG toggle
├── data/<topic>.js         one file per topic (see schema below)
├── vendor/prism/prism.js   Prism core + bash + json (1.30.0)
├── scripts/validate.mjs    checks every data entry (required fields, unique ids, links)
├── scripts/screenshots.mjs renders every terminal component to screenshots/<topic>/<card>.png
├── screenshots/            generated PNGs (shown by the "PNG" toggle when present)
└── package.json            npm scripts + Playwright dev dependency for screenshots
```

## Data schema

Each file under `data/` registers exactly one topic:

```js
AWSCHEAT.register({
  id: 'ec2',                       // kebab-case, unique; section anchor is #ec2
  title: 'EC2',
  order: 5,                        // sidebar / page position (unique number)
  intro: 'One paragraph. `code` and **bold** are supported.',
  subtopics: [                     // anchor is #<topic>-<subtopic>
    { id: 'instances', title: 'Instances' }
  ],
  cards: [
    {
      id: 'describe-instances-table',   // unique in the topic; global id = ec2-describe-instances-table
      subtopic: 'instances',            // must match a subtopic id
      title: 'List instances as a table',
      command: `aws ec2 describe-instances \\
  --query '...' --output table`,        // multi-line ok; use <placeholder> for values to replace
      description: '1–3 sentences: what it does and when to use it.',
      flags: [                          // [] when nothing needs explaining
        ['--query', 'What this flag does.'],
        ['--output table', '...']
      ],
      output: {
        format: 'table',                // json | table | text | plain | yaml | stderr | none
        body: `...`                     // the sample output, exactly as the CLI prints it
      },
      note: { type: 'gotcha', text: '...' },   // optional; type: gotcha | info | danger
      iam: ['ec2:DescribeInstances'],          // optional
      related: ['ec2-start-instances'],        // optional; global card ids
      tags: ['read-only', 'query']             // required; see allowed tags below
    }
  ]
});
```

Rules enforced by the validator:

- Exactly one of `read-only`, `mutating`, `destructive` per card (`destructive` gets the red badge).
  Other allowed tags: `query`, `pagination`, `scripting`, `security`, `cost`, `govcloud`,
  `interactive`, `config`, `waiter`, `jmespath`.
- `output.format: 'json'` bodies must parse (several documents back to back are allowed).
- Every topic must have at least one `--output table` card.
- Card ids must not collide with subtopic ids; `related` ids must exist.
- Placeholders are `<lowercase-kebab>`; sample data uses account `123456789012`,
  `i-0abc123def4567890`, `vpc-0a1b2c3d`, `example-bucket`, `10.0.x.x`.

In command text, backticks (JMESPath literals) must be escaped as `` \` `` inside the template
literal, and a literal `${` must be written `\${`.

## Adding a command card

1. Open the topic file in `data/` (or create a new one and add a `<script src="data/<file>.js">`
   line to `index.html` next to the others).
2. Append an object to `cards` following the schema above. Pick an existing `subtopic` id or add
   a new one to `subtopics`.
3. Write the sample output by hand in the real shape of the CLI response for the chosen
   `--output` format (JSON: 4-space indent; table: the CLI's ASCII grid; text: tab-separated).
4. Run the validator:

   ```sh
   node scripts/validate.mjs          # or: npm run validate
   ```

5. Reload `index.html`. The card appears under its subtopic with anchor
   `#<topic>-<card-id>` and is searchable immediately.

## Regenerating screenshots

The "PNG" toggle in the top bar swaps each live HTML terminal for
`screenshots/<topic>/<card-id>.png` when that file exists (missing files fall back to HTML).

```sh
cd aws-cli
npm install                          # installs Playwright (once)
npx playwright install chromium      # only if no Chromium is available
node scripts/screenshots.mjs         # all cards, dark theme, 2x scale (the committed set was made with --scale 1)
node scripts/screenshots.mjs --topic ec2 --theme light --scale 1
```

Options: `--topic <id>` (one topic), `--theme dark|light`, `--scale <n>` (device scale factor),
`--out <dir>`. The script exits non-zero if the page logs any console error.

## Serving instead of file://

Any static server works:

```sh
npm run serve          # http-server on :8080
python3 -m http.server 8080
```

## Keyboard

| Key | Action |
| --- | --- |
| `/` | Focus search |
| `Esc` | Clear search / close the mobile menu |
| `Tab` | Move between cards, copy buttons, toggles, links (visible focus ring) |
| `Enter`/`Space` on a card's chevron | Collapse / expand that card |
