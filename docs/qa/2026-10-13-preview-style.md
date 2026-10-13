# Preview appearance acceptance

Candidate version: 0.1.2. Scope: preview, copy and draft formatting; no WeChat client automation or draft creation during this check.

- `npm run check`: typecheck, 34 tests in six files, production build passed.
- Local release audit passed for the three required assets; main.js is 190,075 bytes.
- Obsidian 1.14.4, isolated `qiaomu-home-dashboard-qa` vault: loaded the candidate and opened two newly created fixture notes.
- The sidebar hides ItemView's view-header actions. Replaced them with a toolbar inside the preview and confirmed the paintbrush, options, copy and send icons are visible.
- Opened the appearance panel and used native keyboard arrow input to change 17px to 19.5px. The article updated immediately, focus stayed on the slider, and the panel reported saved. Read back plugin data.json to confirm the note-specific font setting.
- Switched to the second fixture: it retained the theme default of 17px. The first note's setting stayed separate.
- Reviewed the real light-theme sidebar rendering. Escape closed the panel and returned focus to the paintbrush. Fixed the previously reported unsafe innerHTML assignments with native node construction and Obsidian sanitizeHTMLToDom. Fixed a host CSS conflict that displayed the hidden retry button, and corrected override targeting for normalized list sections before the final build.
- Remote CI exposed extraneous non-optional esbuild platform packages in the lockfile; regenerated the lockfile metadata without changing declared dependencies. npm ci dry-run passed. Official scan errors were addressed by moving static styles into CSS, removing injected style elements, and using native Setting headings.
- Shared formatting tests cover four themes, inline font size/line height/spacing/padding, unchanged heading/code styles, retained image markers, invalid persisted values, legacy settings and appearance precedence.

Limitations: dark-theme and mobile runtime were not exercised; actual clipboard paste into WeChat and remote draft delivery were not exercised. The Obsidian CLI was disabled in the running app; native UI was used for QA without changing CLI access. The final list/padding/CSS and scanner fixes passed automated checks; a fresh native reload of that final build is still needed. Native UI control subsequently reported user activity, so further app operations were stopped.

Final asset SHA256:

```
main.js       5b4bfc3062a4cfb1f198155935d1ec82f5b8fb3e75b9a9313ef2edf1503c5bf3
manifest.json 6c7afc800760753dbf8e23bff0cb970c35a34f0cb499adcfe850a1d56df3abc8
styles.css    58632ebfdd00be38748a32921ecb81cbc238d420d9dba83e0511618f44b4fe71
```

Public release remains gated on the official preview scan for the final commit. Version 0.1.1 is already a separate draft and is not replaced by this candidate.
