# MindScope 0.6.0 release tests

- Run: 20261024-212706
- Folder: D:\MindScopeReleaseTest-20261024-212706
- Package: MindScope-0.6.0-win-x64-portable.zip

| # | Test | Result | Detail |
|---|---|---|---|
| 1 | unzip and run | PASS | zip: [LICENSE.txt, MindScope.exe]; after run: [cache, config, data, LICENSE.txt, logs, MindScope.exe] + 3 PDFs; new AppData items: 0 |
| 2 | offline (no outside connections) | PASS | none seen from MindScope.exe or its WebView2 processes |
| 3 | backup -> change -> restore | PASS | profiles=1->1 results=2->2 backup=mindscope-20261024-212723-smoke.db |
| 4 | move whole folder | PASS | root follows the folder: True; people after 2nd run: 1 -> 2 |
| 5 | data root via pointer file | PASS | data in D:\MindScopeReleaseTest-20261024-212706\pointer\data-elsewhere; nothing created next to the exe: True |
| 6 | upgrade from 0.1.0 | PASS | schema v1 -> v4; people 1 -> 2 (+1 smoke); results 0 -> 4; pre-migration backup: 1 |
| 6 | upgrade from 0.2.0 | PASS | schema v2 -> v4; people 1 -> 2 (+1 smoke); results 1 -> 5; pre-migration backup: 1 |
| 6 | upgrade from 0.3.0 | PASS | schema v2 -> v4; people 1 -> 2 (+1 smoke); results 0 -> 4; pre-migration backup: 1 |
| 6 | upgrade from 0.4.0 | PASS | schema v3 -> v4; people 1 -> 2 (+1 smoke); results 1 -> 5; pre-migration backup: 1 |
| 6 | upgrade from 0.5.0 | PASS | schema v4 -> v4; people 1 -> 2 (+1 smoke); results 1 -> 5; pre-migration backup: 0 |
| 7 | folder not writable | PASS | message shown with the folder path: True; exit code 1; nothing created: True |
