# cost-oriented-agentic-workflow — güncel handoff

Bu dosya güncel operasyonel snapshot’tır. Tasarım gerekçeleri ve tarihçe için
[`DECISIONS.md`](DECISIONS.md), ölçüm protokolü için
[`DOGFOOD.md`](DOGFOOD.md) okunmalıdır.

## Amaç ve kaynak

- Claude Code için self-contained, token-ekonomisi odaklı agentic workflow.
- Opus planlar, route eder ve bulguları adjudicate eder; Sonnet ağır yazımı
  üstlenir; bağımsız reviewer kaliteyi mode/risk matrisine göre kapılar.
- Otoriter kaynak:
  `C:\Users\gencberke\Desktop\cost-oriented-agentic-workflow`.
- `.claude/plugins/cache` kurulu çıktıdır; elle patchlenmez.
- Branch: `feat/v0.4.0-hardening-and-evals`; release hedefi: `0.4.0`.

## Güncel mimari

```text
triage → plan/contract → inline|delegate → mode/risk review
       → bounded remediation → whole-work review → final verify → finish
```

- Standard/low: self-review + verification; bağımsız task reviewer yok.
- Standard/elevated: non-obvious ise bağımsız task review.
- Standard/high: bağımsız task review zorunlu.
- Production: her planlı task bağımsız review alır.
- Critical/Important fix: taze targeted re-review zorunlu.
- Bir task/final review için en fazla iki autonomous remediation wave vardır;
  bütçe tükenmesi onay anlamına gelmez.

## Workspace ve resume

Her checkout/worktree kendi ignored alanını kullanır:

```text
<repo-root>/.cost-oriented-agentic-workflow/run/
```

`progress.md` şu run kimliğini bir kez pinler:

```text
PLAN_FILE:
MODE:
COMMIT_POLICY:
BASE_BRANCH:
MERGE_BASE_SHA:
```

Her unit route/risk/files/review/waves/verify/commit alanlarını kaydeder. Resume
ve compaction’da plan + ledger + `git log` ground truth’tur. Hook
`COW_ENTRY_INJECTED` sentinel’iyle entry skill’in iki kez yüklenmesini önler.

## Review ve commit sözleşmesi

- Controller task reviewer’a yalnız task’ın `Files` scope’unu verir.
- Task package committed/staged/unstaged/untracked içeriği yalnız izinli yollar
  için taşır; whole-work package dirty current tree’yi reddeder.
- Default `controller-per-unit`: review geçmeden commit yoktur.
- Implementer yalnız `COMMIT_POLICY=implementer` olduğunda commit atabilir.
- Reviewer tüm Critical/Important bulguları korur; en fazla üç Minor ve tek satır
  strengths döndürür.
- Finishing final verification’ın sahibidir; merge sonrası test yeniden koşar.

## Ölçüm

- Token analyzer: `tests/eval/analyze-token-usage.py`.
- Main + subagent input/output/cache/message breakdown üretir; bozuk JSONL
  satırlarını sayıp atlar; fiyat verilmedikçe USD üretmez.
- Altı discovery/precision fixture’ı `tests/eval/fixtures/` altındadır.
- Raw reviewer yalnız `brief.md` + `review.diff` görür; `expected.json` gizlidir.
- Normal prose değişiminde tek smoke; model/routing/review-count değişiminde
  3–5 tekrar yapılır.

## Release doğrulaması

```text
npm test
npm run test:eval
bash -n hooks/session-start hooks/run-hook.cmd \
  skills/execution-routing/scripts/{cow-workspace,task-brief,review-package} \
  tests/scripts.test.sh tests/eval/run-tests.sh
```

Runtime bütçesi: bütün `SKILL.md` dosyaları ve üç dispatch template toplamı
86.000 byte altında; entry/execution ve üç prompt kendi v0.3.2 boyutunun %110’u
altında kalmalıdır.

## Rollout

1. Source release commit’i ve temiz tree’yi doğrula.
2. Claude Code içinde `/plugin update` kullan; cache’e elle yazma.
3. Kurulu manifestin `0.4.0` olduğunu ve source/cache hash’lerinin eşleştiğini
   doğrula.
4. Yeni session aç.
5. Standard-low, production-low, high-risk discovery, two-wave stop,
   compaction resume ve scoped-untracked smoke’larını sırayla çalıştır.

Release kararlarının ayrıntısı `DECISIONS.md` içindeki 2026-06-22 v0.4.0 kaydıdır.
