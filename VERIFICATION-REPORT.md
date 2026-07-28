| ID | Sev | Verdict | Evidence |
|----|-----|---------|----------|
| B1 | Critical | CONFIRMED | popup normalize() return object omits both fields: support=false onboardedVersion=false |
| B2 | High | CONFIRMED | restoreDigits present in RTL branch=true, present in markLTR/mixed/unmark exits=false (2 non-RTL exits, 0 restore) |
| B3 | High | REVIEW | picked-element handler writes settings directly instead of via persistSettings |
| B4 | High | CONFIRMED | recordUsageDay / toggleEnabled / picker / openWelcomePage each do full-object read-modify-write with no serialization |
| B5 | Medium | CONFIRMED | HTML-ish prose flagged as code |
| B6 | Medium | CONFIRMED | paste handler assigns .value directly; React controlled inputs ignore this |
| B7 | Medium | CONFIRMED | openWelcomePage writes settings raw |
| B8 | Low | NOT REPRODUCED | firstStrongDirection('Ecole(accented) + Persian') = ltr |
| B9 | Low | CONFIRMED | popup DEFAULTS.schemaVersion=2 vs util SCHEMA_VERSION=3 |
| B10 | Low | CONFIRMED | content.css has 16 NotebookLM/Kimi-specific rules absent from shadowCss() |
| B11 | High | CONFIRMED | localizeDigits TreeWalks ALL descendant text nodes; SELECTOR also contains wrappers (.markdown, .prose, [data-message-author-role="assistant"]) scanned outer-first, so LTR children inherit localized digits and never restore (B2) |
| B12 | High | CONFIRMED | apex kimi.com absent from manifest matches and SITE_HOSTS |
| B13 | Med/High | CONFIRMED | missing manifest matches: www.chatgpt.com, www.claude.ai, www.grok.com, www.poe.com |
| B14 | Medium | CONFIRMED | accepted over-broad patterns: https://*.com/*, https://*.co.uk/* |
| B15 | Medium | CONFIRMED | font remove handler resets settings.font but does not scrub siteOverrides[*].font |
| B16 | Medium | CONFIRMED | merge(local=1, remote=0).onboardedVersion = 0 |
| B17 | Medium | CONFIRMED | 7 raw storage.local.set({settings}) calls in background.js alone |
| B18 | Low/Med | CONFIRMED (derived) | exportSettings serializes in-memory popup settings, which B1 already stripped |
| B19 | Low | REVIEW | session-storage dedupe has await between read and write (no CAS) |
| B20 | Low | CONFIRMED | dropLoadedFont() runs before the awaited load |
| B21 | Low | CONFIRMED | content.js normalize keeps any custom: id; remoteOnly referenced in content.js = false |
| B22 | High | CONFIRMED | 12/12 plain-English probes classified as code |
| B23 | High | CONFIRMED | sync errors swallowed=true; power-user slim payload = 9976 bytes vs Chrome QUOTA_BYTES_PER_ITEM 8192 |
| B24 | Med/High | CONFIRMED | inline !important styles, no data-hamsoo marks, so removeInjections() cannot undo them |
| B25 | Medium | CONFIRMED | class branch accepts any match count (truthy); id branch requires exactly 1 |
| B26 | Medium | CONFIRMED | max-width !important applied to all non-td/th RTL blocks incl. li and wrappers |
| B27 | Medium | CONFIRMED | 3 occurrences of [contenteditable="true"]; plaintext-only / bare attribute not matched |
| B28 | Medium | CONFIRMED | local picks after merge with empty remote: {} |
| B29 | Low/Med | CONFIRMED | normalizeDigitsScript('AR') = fa |
| B30 | Low | CONFIRMED | indexedDB.open occurrences=1; db.close() calls=0 |
| B31 | Low | CONFIRMED | forces RTL on every descendant of the selection ancestor |
| B32 | Low | CONFIRMED | isRTLBlock('Hello shalom-hebrew') = true |
| B33 | Low | CONFIRMED | digit-only Persian string classified RTL |
| B34 | Medium | CONFIRMED | preview.js seeds 'fontFamily' which is not a real setting key (real key is 'font') |
| B35 | Medium | CONFIRMED | zip.js invokes 'python'; python3-only hosts fall back to `zip -rq` |
| B36 | Medium | CONFIRMED | website never reads release.json; Chrome CTA points at docs anchor |
| B37 | Medium | CONFIRMED | tracked src/STORE-LISTING.md header version drifted from shipped 1.3.0 |
| B38 | Medium | CONFIRMED | SECURITY.md supported-versions table lists only 1.0.x |
| B39 | Medium | CONFIRMED | hardcoded sandbox playwright path in: compare-shots.mjs, publish-assets.mjs |
| B40 | Low/Med | CONFIRMED | welcome.css focus-visible=false reduced-motion=false |
| B41 | Low/Med | CONFIRMED | alignStart label reads 'Right' while stored value is logical 'start' |
| B43 | Low | CONFIRMED | welcome.html inline Persian fallback contains the typo |
| B44 | Low | CONFIRMED | website dictionary has no Arabic entry |

TOTAL CHECKED: 43
VERDICT COUNTS: {"CONFIRMED":40,"REVIEW":2,"NOT":1}
