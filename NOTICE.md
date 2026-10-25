# MindScope — licensing and third-party notices

## How MindScope is licensed

| Part | Folder | License |
|---|---|---|
| The application as a whole (UI, desktop shell) | `apps/` | AGPL-3.0-or-later — see `LICENSE` |
| Scoring engine and domain core | `packages/core/` | MIT — see `LICENSE-MIT` |
| Database schema, migrations, repositories | `packages/storage/` | MIT — see `LICENSE-MIT` |
| Self-written item banks, report texts and the MindScope stress check | `packages/banks/` | CC BY-SA 4.0 |
| Third-party questionnaires | `packages/banks/wellbeing/` | see "Questionnaires" below |
| Logo and brand assets | `assets/brand/` | CC BY-SA 4.0 |

AGPL-3.0 means: anyone may use, study, change and share MindScope, and anyone
who distributes a modified version — or runs one as a website for others —
must publish their source code under the same license.

"MBTI" and "Myers-Briggs Type Indicator" are registered trademarks of The
Myers-Briggs Company. MindScope is not affiliated with it, and its
16-type test is not the official MBTI instrument.

## Big Five (preview)

| Part | File | Terms |
|---|---|---|
| Item texts (English), scoring keys | `packages/banks/bigfive/ipip-b5-0.1.0.json` | **Public domain** — International Personality Item Pool (ipip.ori.org): "The items and scales are in the public domain", usable without permission or fee. Forms: Mini-IPIP (Donnellan et al., 2006), 50-item Big-Five factor markers (Goldberg, 1992), IPIP-NEO-120 (Johnson, 2014). |
| Chinese translation, two adapted items, domain/facet texts | same file, `packages/banks/bigfive/texts.json` | CC BY-SA 4.0 (MindScope). The translation is not yet validated. In the IPIP-NEO-120 Liberalism facet, the two items about voting for liberal/conservative candidates were replaced with neutral value-openness items. |

## Questionnaires (wellbeing self-checks)

| Scale | File | Status | Terms |
|---|---|---|---|
| PHQ-9 | `packages/banks/wellbeing/phq9-1.0.0.json` | Public domain | Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues with an educational grant from Pfizer Inc. The instrument manual states that no permission is required to reproduce, translate, display or distribute it. |
| GAD-7 | `packages/banks/wellbeing/gad7-1.0.0.json` | Public domain | Same authors and terms as PHQ-9. |
| WHO-5 | `packages/banks/wellbeing/who5-1.0.0.json` | © World Health Organization 2024, CC BY-NC-SA 3.0 IGO | Text from WHO's published WHO-5 (Chinese version from WHO's translations). **Non-commercial only.** This file is not covered by the CC BY-SA 4.0 license of the other bank files. Anyone redistributing MindScope commercially must remove this file (and its entry in `packages/banks/src/index.ts`). |
| MindScope stress check | `packages/banks/wellbeing/stress-0.1.0.json` | CC BY-SA 4.0 | Written for MindScope; not a standardised or validated scale. |

Chinese PHQ-9 / GAD-7 wording follows the simplified-Chinese versions widely
used in mainland research; it has not been checked word by word against the
official translation on phqscreeners.com.

WHO-5 translation notice (required by WHO): *This translation was not created
by the World Health Organization (WHO). WHO is not responsible for the content
or accuracy of this translation. The original English edition shall be the
binding and authentic edition.* — the exact wording shipped with the scale is
in the `translationNote` field of the WHO-5 file and is printed on every
WHO-5 result and report.

All self-checks are screening tools, not diagnoses. The DASS-21 and PSS-10
were considered and **not** included because their terms do not clearly allow
use in a public app that shows scores.

## Third-party software bundled in the app

| Component | License |
|---|---|
| Tauri, tao, wry (desktop shell) | MIT OR Apache-2.0 |
| webview2-com, windows-rs | MIT OR Apache-2.0 |
| rusqlite | MIT |
| SQLite (bundled via rusqlite and @sqlite.org/sqlite-wasm) | Public domain |
| @sqlite.org/sqlite-wasm | Apache-2.0 |
| tracing, tracing-subscriber, tracing-appender | MIT |
| serde, serde_json, chrono | MIT OR Apache-2.0 |
| reqwest, hyper, native-tls, futures-util (optional AI requests) | MIT OR Apache-2.0 |
| tokio | MIT |
| Vue, Vue Router, Pinia, vue-i18n | MIT |
| Naive UI | MIT |
| Apache ECharts | Apache-2.0 |
| @tauri-apps/api | Apache-2.0 OR MIT |

The full dependency list with licenses can be regenerated with
`cargo tree -e normal --format "{p} {l}"` (Rust) and `npm ls --all` (JavaScript).

## Optional AI features and third-party services

AI analysis is off by default. When a user turns it on, MindScope sends the
data the user selects — after showing it and asking — to the AI provider the
user configured (for example Alibaba Cloud Bailian / Model Studio). That
provider's own terms and privacy policy apply to those requests; MindScope is
not affiliated with any provider. The API key is stored only on the user's
computer, encrypted with Windows DPAPI. No AI provider SDK or model is bundled.

## Runtime component not bundled

The Windows desktop app uses the **Microsoft Edge WebView2 Runtime**, which is
part of Windows 11 and is installed on most Windows 10 systems. It is a
Microsoft component governed by Microsoft's own terms and update mechanism.
