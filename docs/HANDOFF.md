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
- Branch: `feat/v0.4.0-hardening-and-evals`; sürüm: `0.4.2` (cleanup/packaging —
  kaynak repo / runtime paket ayrımı). Ayrıntı: `DECISIONS.md` 2026-06-24 kaydı
  ve `CHANGELOG.md`. Önceki: `0.4.1` (routing kaçış yolları + reproducible
  release, 2026-06-23).

## Kaynak repo vs. runtime paket (0.4.2)

- Bu repo **otoriter geliştirme ağacıdır**: skills + commands yanında tests,
  docs, scripts, eval fixture'ları, release tooling ve `.git` geçmişi taşır.
  Temiz kurulum kaynağı **değildir** — tümüyle kurmak dev artefaktlarını cache'e
  taşır.
- **Runtime paketi üretilir, elle tutulmaz.** Build komutu:

  ```text
  node scripts/build-runtime-package.mjs
  # veya: npm run runtime:build
  ```

  Git-tracked içerikten allowlist'le (`.claude-plugin`, `commands`, `skills`,
  opt-in `hooks`, `README.md`, `LICENSE`) temiz bir runtime dizini + ZIP +
  SHA-256 + manifest üretir; çıktı repo **dışında**, varsayılan
  `../cost-oriented-agentic-workflow-runtime/`. ZIP `git archive` ile üretilir,
  exec bitleri korunur. Builder dirty tracked tree ve repo-içi output path'leri
  reddeder; başarı raporlamadan önce kendini doğrular.
- **Güvenli temizlik:**

  ```text
  node scripts/clean-generated.mjs            # dry-run (önizleme)
  node scripts/clean-generated.mjs --apply     # dist/ + .cost-oriented-agentic-workflow/eval/ siler
  ```

  `git clean` kullanılmaz; tracked source, `.git` ve
  `.cost-oriented-agentic-workflow/run/` korunur.
- Kurulum kullanıcıya bırakılmıştır: üretilen runtime dizininden veya ZIP'ten
  kurulur. Bu yamada **kurulum/aktivasyon yapılmadı**, marketplace/cache
  değiştirilmedi.
- Bu cleanup-only yamada **tam testler ve dogfood bilinçli olarak yeniden
  koşulmadı** (davranış değişmediği için). Sonraki mimari faz: **0.5.0**.

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

### v0.4.1 routing invariantları (kaçış yolları kapalı)

- **Disjoint teşhis fix boyutundan bağımsız delege edilir.** Ucuz domain map
  disjoint problem alanlarını gösterince teşhis bounded read-only investigator'lara
  gider; "fix'ler küçük" token-ağır araştırmayı controller'da tutamaz. Küçüklük
  yalnız teşhis sonrası implementation routing'i etkiler.
- **Tracked diagnostic edit route geçişidir.** Read-only teşhis ilk tracked
  edit'te biter; edit'ten ÖNCE `Re-route:` receipt; dependency/harness/config/
  schema planlı elevated diagnostic unit olur; teknik onayı eski route'u
  korumaz; geçici instrumentation'ın cleanup disposition'ı vardır.
- **Aynı dosya bağımsız outcome'ları birleştirmez.** Birim sınırı = outcome +
  sorumluluk + doğrulama seam'i (dosya kümesi değil). İki bağımsız outcome → ayrı
  sıralı unit'ler ya da ayrı acceptance/regression'lı tek delegated batch; asla
  tek light-inline. Overlap sıralanır, paralelleştirilmez.
- Yapısal invariantlar `validate-structure.mjs`'de; route-only davranış
  `tests/eval/routing/` fixture'larında ve `DOGFOOD.md` canlı protokolünde.

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
npm run verify:all        # check + helpers + eval + paketlenmiş artefakt testi
npm run release:build      # dist/<ad>-<sürüm>.zip (temiz commit'ten, git archive)
npm run test:release       # paketlenmiş artefaktı bağımsız doğrula
claude plugin validate . --strict
bash -n hooks/session-start hooks/run-hook.cmd scripts/build-release.sh \
  skills/execution-routing/scripts/{cow-workspace,task-brief,review-package} \
  tests/scripts.test.sh tests/eval/run-tests.sh tests/release-artifact.test.sh
```

Runtime bütçesi: bütün `SKILL.md` dosyaları ve üç dispatch template toplamı
86.000 byte altında (şu an 85.432); entry/execution ve üç prompt kendi v0.3.2
boyutunun %110’u altında kalmalıdır. Eval runner Python 3'ü **çalıştırarak**
seçer (Windows App-execution-alias'ı PATH'te çözülüp çalışmadığı için atlar,
`py` launcher'ını dener).

## Rollout

1. Source release commit’i ve temiz tree’yi doğrula.
2. Yerel marketplace `cost-oriented-agentic-workflow-dev`'i resmî Claude plugin
   komutuyla güncelle (`/plugin` veya `claude plugin marketplace update`);
   cache’e elle yazma.
3. Kurulu manifestin `0.4.1` olduğunu ve source/cache içeriğinin eşleştiğini
   doğrula (yalnız Claude’un ürettiği cache-sahipli metadata hariç).
4. Yeni session aç.
5. Standard-low, production-low, high-risk discovery, two-wave stop,
   compaction resume, scoped-untracked ve route-only smoke’larını çalıştır.

Release kararlarının ayrıntısı `DECISIONS.md` içindeki 2026-06-23 v0.4.1
kaydıdır (önceki v0.4.0 kaydı 2026-06-22).
