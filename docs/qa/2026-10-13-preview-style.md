# Preview appearance acceptance

Candidate version: 0.1.2. Scope: preview, copy and draft formatting; no WeChat client automation or draft creation during this check.

- `npm run check`: typecheck, 34 tests in six files, production build passed.
- Local release audit passed for the three required assets; main.js is 190,648 bytes.
- Obsidian 1.14.4, isolated `qiaomu-home-dashboard-qa` vault: loaded the candidate and opened two newly created fixture notes.
- The sidebar hides ItemView's view-header actions. Replaced them with a toolbar inside the preview and confirmed the paintbrush, options, copy and send icons are visible.
- Opened the appearance panel and used native keyboard arrow input to change 17px to 19.5px. The article updated immediately, focus stayed on the slider, and the panel reported saved. Read back plugin data.json to confirm the note-specific font setting.
- Switched to the second fixture: it retained the theme default of 17px. The first note's setting stayed separate.
- Reviewed the real light-theme sidebar rendering. Escape closed the panel and returned focus to the paintbrush. Fixed the previously reported unsafe innerHTML assignments with native node construction and Obsidian sanitizeHTMLToDom. Fixed a host CSS conflict that displayed the hidden retry button, and corrected override targeting for normalized list sections before the final build.
- Shared formatting tests cover four themes, inline font size/line height/spacing/padding, unchanged heading/code styles, retained image markers, invalid persisted values, legacy settings and appearance precedence.

Limitations: dark-theme and mobile runtime were not exercised; actual clipboard paste into WeChat and remote draft delivery were not exercised. The Obsidian CLI was disabled in the running app; native UI was used for QA without changing CLI access. The final small list/padding/CSS fixes passed automated checks; a fresh native reload of that final build is still needed.

Final asset SHA256:

```
main.js       43e0a2cd6efd4cacc8434d2d4b4c50f9c67177ec045200df0603f4d054694fde
manifest.json 6c7afc800760753dbf8e23bff0cb970c35a34f0cb499adcfe850a1d56df3abc8
styles.css    759721a4965601296fee80cc90d14a114dfcda813ae50c273d565709d3c9674c
```

Public release remains gated on the official preview scan for the final commit. Version 0.1.1 is already a separate draft and is not replaced by this candidate.
