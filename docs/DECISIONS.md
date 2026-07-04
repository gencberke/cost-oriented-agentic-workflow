# cost-oriented-agentic-workflow — Karar Defteri

> Amaç: superpowers'tan türeyen, token-ekonomisi odaklı, Claude Code'a özel bir agentic skillset.
> Çekirdek ekonomi: **Opus planlar + gözden geçirir; Sonnet reasoning yapıp kod yazar; controller context'i hafif kalır.**
> Durum etiketleri: ✅ kullanıcı onayladı · 🟡 Claude önerisi, onay bekliyor · ⏳ henüz planlanmadı

---

## 2026-06-30 — Documentation reset and agent onboarding

- Future-facing project documentation is now English-only.
- `AGENTS.md` is the first-read manifesto for incoming agents: purpose, current
  state, invariants, verification, docs map, and roadmap.
- The old v0.5.0 architecture sprawl was aggressively consolidated into a small
  canonical set under `docs/architecture/v0.5.0/`.
- Per-phase handoff files and the oversized master handoff were removed from the
  working tree after their durable facts were folded into `AGENTS.md`,
  `docs/HANDOFF.md`, and the compact architecture docs.
- Git history is the archive for exact old handoff text; do not reintroduce long
  rolling handoff files unless a future release process explicitly requires
  them.

---

## 2026-06-30 - Superseding correction: master handoff retained

- Correction to the immediately preceding documentation reset entry: the old
  per-phase handoff files remain removed from the working tree, but a current
  `docs/architecture/v0.5.0/COW-MASTER-HANDOFF.md` is retained as a deep context
  recovery document.
- Git history remains the archive for exact old handoff text. The master handoff
  is not the first-read surface; `AGENTS.md` and `docs/HANDOFF.md` are.

## 2026-06-30 - v0.5 control-plane decision summary

- State is a validated projection and reconstructable cache. Git, plan, ledger,
  reports, and review artifacts remain authoritative.
- Plugin agents are scoped workers. They never update workflow state, never stage,
  and never commit. `COMMIT_POLICY` is controller-owned metadata and cannot grant
  commit authority to a plugin agent.
- Discovery routing and implementation routing are separate axes; task
  uncertainty can trigger discovery even when repository profile validity is warm.
- Implementation evidence is attempt-qualified and baseline-relative; retries keep
  the same unit baseline.
- Review uses scoped packages, causality classification, targeted re-review after
  Critical/Important fixes, and a two-wave remediation ceiling.
- Phase 4 hooks are shadow only: fail-open, bounded observation, no state
  mutation, no active `hooks/hooks.json`.
- Phase 5 may enforce only zero-false-positive binary rules. Broad shell parsing
  and judgment-heavy hook decisions remain rejected.
- Phase 6 owns repeated behavioral sampling and token/cost calibration. Normal
  phase work is deterministic-first and live-smoke-minimal.
- The generated `0.4.2` runtime package is not yet the complete v0.5.0
  distribution; top-level `agents/**` and active hooks are release-path work.
- Headroom remains rejected as a baseline dependency. Any compatibility experiment
  must be optional, lossless for structured evidence, and deferred until after the
  core control-plane gates.

## 2026-06-30 — Phase 6: deterministic evaluation harness (live evidence deferred)

- Built the Phase 6 evaluation harness as deterministic tooling only. No live
  Claude runs were executed in this pass; live evidence is partial/deferred.
- Run-record schema version 1 captures one bounded record per run: identity
  (runId, datedAt, environmentId, claudeCodeVersion, condition, fixtureId),
  actual models from result metadata, process exit code, semantic result, token
  and cost metrics (missing vs zero preserved), tool/dispatch/read accounting,
  workflow accounting (attempts, waves, commits, changed paths), hook
  ask/deny counts, analyzer violations, task and preservation assertions, and a
  retry classification. Sensitive fields (prompts, secrets, transcripts,
  chain-of-thought) are rejected; records are capped at 20 KiB.
- Six semantic result classes: `WORKFLOW_COMPLETED`,
  `WORKFLOW_BLOCKED_EXPECTED`, `WORKFLOW_FAILED`, `HARNESS_FAILURE`,
  `PROCESS_FAILURE`, `INSUFFICIENT_EVIDENCE`. A clean repo or exit 0 alone is
  not success.
- The aggregator compares matched conditions pairwise (VANILLA vs COW_SHADOW,
  COW_SHADOW vs COW_ENFORCE), refuses comparisons on fixture/model/environment
  mismatch, distinguishes missing from zero, reports outliers without deleting
  them, and gates cost-improvement claims on correctness + preservation first.
  Percentage with a zero baseline reports absolute diff only (null percent).
- F1–F5 fixtures are prepared now; live runs are deferred. The minimum live
  matrix is F1 VANILLA → F1 COW_SHADOW → F4 standard ask → F4 production deny,
  stopping when usage/environment is insufficient.
- Phase 6H: an optional Headroom experiment specification is recorded. Headroom
  is not installed, configured, or invoked in Phase 6 core. The spec requires
  identical fixtures, no COW mutation, no memory/learn, no output shaping, no
  code compression, exact contract/path/SHA preservation, and separate
  correctness and token results.
- No numeric thresholds are set in this pass. Thresholds will be recorded in a
  dated `DECISIONS.md` entry only after live evidence exists, with
  insufficient-sample values marked provisional. Historical decision records
  are not modified.
- No active `hooks/hooks.json` is created. State schema version, agents,
  routing, review matrix, runtime packaging, and package version are unchanged.

## 2026-06-30 — Phase 5A: selective static enforcement

- Added an explicit enforcement mode to `cow-hook.mjs` via
  `--decision-mode=shadow|enforce` (PreToolUse only). Default stays `shadow`;
  only the exact value `enforce` enables enforcement. Shadow mode is preserved
  byte-identically so Phase 4 tests are unaffected.
- Enforcement may emit only `ask` or `deny` (never `allow`/`defer`/`updatedInput`,
  never exit 2). No match, uncertainty, internal error, and
  absent/inactive/corrupt state all fail open with exit 0 and empty stdout.
- Enforced the zero-false-positive binary set E1–E7 (see
  `docs/architecture/v0.5.0/04-state-machine-and-hook-enforcement.md`). E8
  destructive Git and the judgment-based R5 wrong-agent rule stay shadow-only.
- Interpretations pinned: E5 "executable approved plan" = `plan.status ∈
  {approved,executing,done}` (matches the Phase 4 `isPlanApproved` test); E7 is
  gated on `phase=implementing` and uses exact token matching so combined flags
  like `-am` are not treated as `-a`; E6 is restricted to the four structured
  `cow-*` agents (agent identity from metadata only, never prompt text); E7 is
  not agent-bound (controllers can also broad-stage).
- Bash matching supports only simple commands. A single char-class guard
  rejects compound/redirect/substitution operators, env-prefixed commands,
  nested `bash -c`, multiline commands, and deceptive substrings. Ambiguous
  shapes fail open rather than risk false positives.
- Observation schema is extended additively with `actualDecision`
  (`none|ask|deny`) and `reasonCode` (bounded `E1..E7` enum). Shadow
  observations remain byte-identical (schema version 1 unchanged); `reasonCode`
  appears only in enforce-mode observations, immediately after `actualDecision`.
- No active `hooks/hooks.json` is created. `hooks/hooks.enforcement.json.example`
  is an inactive example whose runtime activation is deferred to Phase 6. State
  schema version, agents, routing, review matrix, runtime packaging, and package
  version are unchanged.
- Live ASK/DENY smoke is deferred to Phase 6 (`PHASE_5_LIVE_ASK_DENY_SMOKE_DEFERRED_TO_PHASE_6`).
  Benign fixture results (0 ask / 0 deny) are fixture evidence, not proof of
  real-world zero false positives.

## 2026-06-30 - Phase 7A: release-candidate repository preparation

- Phase 7A prepares the repository for a future `0.5.0` release but does not
  perform the public release, version bump, tag, push, publish, or install.
- Runtime packaging now targets the v0.5.0 candidate surface: plugin metadata,
  commands, skills, all four agents, inactive hook examples, README, and license.
  Tests, docs, scripts, eval fixtures, raw evidence, phase prompts, local
  worktrees, and active `hooks/hooks.json` remain excluded.
- Candidate and final gates are intentionally distinct. Candidate validation may
  pass with live gates pending; final validation fails with
  `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE` until Phase 3B.2, Phase 4, Phase 5,
  and sufficient Phase 6 live evidence is accepted.
- Current docs phrase live hook activation as deferred until evidence accepts
  it. Older Phase 5 entries that say "deferred to Phase 6" are historical
  records, not permission to activate enforcement now.
- Version finalization is dry-run only in this phase. Authoritative locations are
  `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`,
  `package.json`, the version-neutral README install example, runtime manifest
  metadata derived from plugin metadata, and the pending `CHANGELOG.md` heading.
- Runtime package safety rejects personal absolute paths, active hook configs,
  development-only files, unsafe output roots, duplicate manifest paths, and
  broken packaged Markdown links.
- Windows Bash suites now go through a Node wrapper that prefers Git Bash, while
  the release package test itself is Node-based.

## 2026-07-04 - Phase 7B live evidence attempt: final release remains blocked

- Baseline matched the Phase 7B expectation: `npm.cmd run check` passed with
  467 checks, `npm.cmd run release:check:candidate` passed, and
  `npm.cmd run release:check:final` failed with
  `LIVE_EVIDENCE_REQUIRED_BEFORE_RELEASE`.
- Live Claude Code model evidence could not be accepted. The F1 VANILLA smoke
  and a minimal auth confirmation smoke both reached Claude Code stream-json
  output but stopped before model execution with `authentication_failed`.
  Token and completed-model cost numbers were zero.
- The F1 auth-failed stream was converted with
  `tests/eval/phase6/stream-to-run.mjs` and the resulting run record validated
  with `tests/eval/phase6/validate-run.mjs`. The record is
  `PROCESS_FAILURE` with retry classification `AUTH`, not behavioral evidence.
- Phase 5 deterministic enforcement was re-run with
  `npm.cmd run test:enforcement`: 130 checks passed, 0 failed. This remains
  partial support only; the live ASK/DENY hook-event stream was not accepted.
- The Phase 7B evidence manifest is recorded at
  `docs/release-evidence/0.5.0/live-evidence.json`. It intentionally keeps all
  four required final gates pending: Phase 3B.2 review lifecycle, Phase 4
  resume/compact, Phase 5 ASK/DENY, and Phase 6 behavioral/token/cost.
- Raw stream provenance is repo-relative only and lives under the ignored
  `.cost-oriented-agentic-workflow/eval/phase7b/` workspace. The final release
  gate treats those raw paths and SHA-256 values as provenance metadata; it
  validates only committed evidence artifacts under `docs/release-evidence/`.
- Final release remains blocked. No `0.5.0` version bump, tag, push, publish,
  install, runtime activation, or token-savings/behavior claim is permitted from
  this run.

## Legacy decision log note

The sections below preserve the earlier Turkish decision log. Some old pending
markers were superseded by the v0.5 control-plane decisions above; use the current
English docs for active project state and treat the old sections as historical
rationale unless a later dated entry confirms them.

---

## A. Kimlik & kapsam
- **A1** 🟡 Ad: `cost-oriented-agentic-workflow` (komut adından çıkarım).
- **A2** ✅ Aktivasyon: komutla çağrı tercih; ANCAK SessionStart-hook benzeri bir yapı skill kullanımını tüm session boyunca **garanti ediyorsa** o tercih edilir. Skill kullanımı session boyunca **yüksek öncelik**.
- **A3** 🟡 superpowers ilişkisi: **inherit + refactor (kendi özlü kopyalarımız)**. Değiştirdiğimiz orkestrasyon/ton/routing/kalibrasyon skill'lerini sahipleniriz; değişmeyen stabil teknikleri upstream'e yakın tutarız. Gerekçe: (1) çağrılan skill **parametrelenemez** — mod/hafiflik/routing enjekte edemeyiz; (2) kendi kopyamız daha **kısa** = daha az context yükü; (3) runtime bağımlılık/kırılganlık yok.
- **A4** ✅ Yalnız Claude Code için optimize.

## B. Mod
- **B1** ✅ İki mod: **standart (varsayılan)** + **production** (`cost-oriented-agentic-workflow:production` komutuyla). Ayrı "standart" moduna gerek yok; default zaten o.
- **B2** ✅ Belirleme: default standart; production komutla.
- **B3** ✅ Mid-session mod değişimi yok.
- **B4** ✅ **production** = güvenilirlik öne çıkar (maliyetin önünde): gerekli noktalarda testleri sıkı tut; çok kapsamlı kod isteklerinde **Opus alt-ajanı** kodu üretir; güvenlik riski / düşük hata toleransı olan yerlerde sıkı/detaylı review. **standart** = bu defterde planlandığı gibi.

## C. Planlama & brainstorming
- **C1** ✅ Brainstorming kapısı **her zaman**; yoğunluğu kullanıcının ihtiyacına göre ölçeklenir (dağınık istek → daha yoğun brainstorming).
- **C2** ✅ Çıktı: aksi istenmedikçe standart; özellikle istenince kapsamlı rapor.
- **C3** ✅ Task'lara bölme **zorunlu**; granülerlik karmaşıklıkla ölçeklenir (basit → az task, karmaşık → çok alt-task).
- **C4** 🟡 Yazımdan önce her zaman bir plan/kontrat olur (hafif olabilir); açık onay kapısı **production'da** veya istenince.

## D. Yürütme yönlendirmesi
- **D0** ✅ Mimari = **1** (Opus planlar/gözden geçirir; Sonnet reasoning yapıp yazar; geri **özet** döner).
- **D1** 🟡 Devret/inline kararı — "kontrat maliyeti" kuralı (aşağıda Açık Soru #2).
- **D2** ✅ Yazan ajan: **Sonnet 4.6, high effort** (focused prompt gireceği için yeterli).
- **D4** 🟡 Spec inceliği ↔ drift mekanizması = "dikiş yerlerini pinle, içini serbest bırak" (aşağıda Açık Soru #3).
- **D5** 🟡 Batching: tutarlı öbek (birbirine bağlı birkaç dosya/alt-sistem) tek pakette.
- **D6** ✅ Geri dönüş = yalnız özet + değişen dosyalar + doğrulama sonucu (kod gövdesi Opus'a geri yüklenmez).
- **D7** ✅ Bağımsız öbekler farklı subagent'larca paralel yönetilebilir (+ katı dosya-sahipliği kuralı, aşağıda D9).
- **D8** ✅ Alt ajan retry hakkı: **en fazla 2 ek deneme**, başaramazsa Opus'a döner.
- **D9** 🟡 Worktree: standart'ta **yok**; paralel subagent'larda **katı non-overlapping dosya-sahipliği** (worktree'den ucuz); worktree yalnız production'da veya öbekler ayrıştırılamıyorsa (aşağıda Açık Soru #6).

## E. Review & doğrulama
- **E1** 🟡 standart = **bağımsız Sonnet reviewer** (yazan ajandan farklı instance) spec-uyum + build/doğrulama yapar + Opus yalnız **dikiş/diff düzeyinde** ince bakış; production = Opus/Opus-ajan derin review + gerekirse security-auditor (aşağıda Açık Soru #4).
- **E2** 🟡 Review derinliği standart'ta diff/dikiş düzeyi; production'da derin.
- **E4** ✅ Sonnet basit task'lar sonrası kendi test eder; dönüş mesajında sıkıntı var/yok bildirir.
- **E5** ✅ "Kanıt olmadan 'bitti' deme" korunur.

## F. Test
- **F1** ✅ standart = çok kısıtlı, yalnız gerçekten gerekli testler; production = detaylı.
- **F3** ✅ Testi subagent yazar.

## G. Token/maliyet ekonomisi
- **G1** ✅ Controller'ı hafif tut: özet al, büyük dosyaları geri yükleme.
- **G2** ✅ Keşif: bağlamı olan repo'yu yeniden keşfetme YOK; yeni/bilinmeyen repo'da büyüklüğe göre Explore ajan(lar)ı beklenen davranış.

## H. Dil: yargı vs MUST
- **H1** 🟡 Çizgi: **ikili + atlanırsa felaket** olan şeyler HARD MUST; **sürekli ödünleşim** olan şeyler yargı. Uzun-session drift'ine karşı asıl çapa **kalıcı task-listesi/kontrat** (her döngüde küçük olanı yeniden okumak), blanket MUST tonu değil (aşağıda Açık Soru #5).

## I. Inherit/compose mekaniği — ⏳ birlikte planlanacak
## J. Sınırlar & izinler — ⏳ birlikte planlanacak

---

## Açık soruların çözümleri (Claude önerileri, onay bekliyor)

### #2 (D1) — Devret mi, Opus inline mı? "Kontrat maliyeti" kuralı
İlke: **Bir işi alt ajana devretmek için yazman gereken kontrat (scope + kabul kriterleri + doğrulama), işi kendin yazmakla kıyaslanır.**
- Kontrat ≈ kodun kendisi kadar emek istiyorsa → **Opus inline yaz** (devir overhead'i tasarrufu yer).
- Kod hacmi kontratı açıkça gölgede bırakıyorsa → **devret.**
- Sert taban: tek küçük düzenleme / < ~40-60 satır / Opus'un zaten elinde tuttuğu sıkı-bağlı değişiklik → **inline.**
- Eşik üstü (≥ ~2 dosya VEYA ≥ ~80-100 satır, kendi içinde spesifiklenebilir) → **devret.**
- Küçük ama çok sayıda ilişkili dosya → tek pakette **batch** edip devret (overhead'i amorti et).

### #3 (D4) — Spec inceliği ↔ drift: "dikişleri pinle, içini serbest bırak"
Kontrat yalnız **between-unit** olanı kesin yazar (dosya adları, imzalar, veri şekilleri, mevcut kodla entegrasyon, kabul kriterleri, doğrulama komutu); **within-unit** uygulamayı Sonnet'e bırakır ("iç detay senin").
- Böylece drift, ucuz ve kolay-yakalanan **birim içine** hapsolur; pahalı **birimler arası** kilitli kalır.
- Drift kontrolü = kontrattaki **doğrulama komutu + kabul kriterleri**; Sonnet dönüşten önce bunlara karşı kendini sınar.
- Mod modülasyonu: standart = yalnız arayüz pinle (ince, iç varyansı kabul); production = arayüz + kilit davranışlar + test (kalın).

### #4 (E1) — Ayrı Sonnet reviewer mı, Opus self-review mı?
İkisini **moda göre** birleştir; ortak kural: **reviewer, yazan ajandan farklı bir instance olmalı** (bağımsızlık).
- **standart:** bağımsız **Sonnet reviewer** spec-uyum + build/kriter doğrulaması yapar (ucuz, bağımsız, Opus'u hafif tutar) + Opus yalnız **dikiş noktalarına** ince bakar (tam yeniden-okuma değil). Aynı-seviye review'a entegrasyonu tek başına emanet etmemek için bu ince Opus bakışı şart.
- **production:** derin review Opus/Opus-ajan; güvenlik-hassas → security-auditor.
- Reviewer kod okur (kendi ucuz token'ı), Opus'a **özet/verdikt** döner; Opus context'i hafif kalır.

### #5 (H1) — Çizgiyi nereye çekeriz (drift korkusu)
- **HARD MUST (asla yumuşatma — bunlar çapa):** kanıt olmadan "bitti" deme; plan/kontrat olmadan koda başlama; scope dışına sessizce çıkma (değişikliği yüzeye çıkar); güvenlik/geri-döndürülemez işlerde onay; dönüş protokolü (özet döndür, kod yapıştırma).
- **YARGI (maliyet-fayda):** devret vs inline, spec inceliği, review derinliği, test yazılsın mı, brainstorming yoğunluğu.
- **Asıl anti-drift mekanizması tonda değil yapıda:** kalıcı **task-listesi + kontrat** her döngüde yeniden okunur (küçük, ucuz çapa). Uzun session'lar, ucuz bir yeniden-çapalama artefaktı yoksa sapar; task-listesi o artefakttır.

### #6 (D9) — Worktree, standart modda
Katılıyorum: standart **tek-akışlı** işte worktree gereksiz. Ama D7 (paralel subagent) aktifken çakışma riski var → çözüm worktree değil, **katı non-overlapping dosya-sahipliği** (her ajana ayrık dosya kümesi). Worktree yalnız: production'da, ya da öbekler dosya bazında ayrıştırılamıyorsa.

### (A3 ek) — "Çağırırsak configüre edemeyiz, değil mi?"
Doğru. Çağrılan bir skill'in metni sabittir; ona "mod=standart, hafif ol, yazmayı Sonnet'e ver" gibi parametre **geçemezsin**. Bu yüzden değiştirmek istediğimiz her şeyi **sahiplenmemiz** gerekiyor.

---

## ONAY (2026-06-18)
Kullanıcı yukarıdaki TÜM 🟡 maddeleri **✅ onayladı.** Tasarım kararları kapandı; geriye I, J ve build kaldı.

## I. Inherit/compose mekaniği — ✅
- **Yapı:** kendi **Claude Code plugin**'imiz `cost-oriented-agentic-workflow`, kendi `skills/` dizini. **Self-contained** — superpowers'a runtime bağımlılık yok (kırılganlık + parametrelenememe). superpowers'tan **manuel, ara sıra sync**; forklanan sürüm not edilir.
- **Sahiplendiğimiz (özlü kendi kopya):** entry/policy skill (mod + routing + yargı çizgisi + anti-drift), brainstorming-lite, planning/task, **execution-routing (yeni — bizim IP)**, review.
- **Yakın-upstream kopyalanan (kullandığımız kadarı, hafif edit):** verification-before-completion (korunur), preparing-subagent-prompts (paketleme disiplini), dispatching-parallel-agents (D7); test-driven-development + security-auditor yalnız **production**.
- **Aktivasyon:** launcher komutu `/cost-oriented-agentic-workflow` (default standart) + `:production`; opsiyonel SessionStart hook (her-session açık isteyene). Default: komut.
- **Mod parametresi:** entry skill modu çağrı biçiminden okur; **mod, plan/task dosyasının en başına yazılır** → tüm session ve compaction boyunca kalıcı çapa.

## J. Sınırlar & izinler — ✅
- Claude Code izin modeli korunur; skillset tehlikeli komutları otomatik onaylamaz.
- Subagent'lar aynı izin duruşuyla çalışır; geri-döndürülemez / dışa-dönük / güvenlik-hassas işler **onay ister** (HARD MUST, H1 ile tutarlı).
- **production**'da plan-onay kapısı; **standart**'ta hafif.
- (Opsiyonel, v2) G3 "yeterince iyi, dur" bütçe eşiği — şimdilik kapsam dışı.

## NEXT STEPS — compact SONRASI build sırası
0. **Skill yazım formatını netle:** `anthropic-skills:skill-creator` veya `agentic-superpowers:writing-skills` ile, ya da superpowers plugin yapısını şablon alarak doğru dosya/manifest formatını teyit et.
1. **Plugin iskeleti** + manifest + `skills/` dizini.
2. ⭐ **entry/policy skill** (kalp: modlar, routing kuralı, yargı çizgisi, anti-drift task-listesi).
3. **execution-routing skill** (Arch-1 kontrat şablonu, devret kuralı = "kontrat maliyeti", dönüş protokolü, retry-2).
4. **brainstorming-lite + planning/task skill.**
5. **review skill** (bağımsız Sonnet reviewer + Opus dikiş-bakışı; moda göre).
6. **launcher komutu** (+ opsiyonel SessionStart hook).
7. **Dogfood:** küçük throwaway görevde dene, iterasyon yap.

---

## Revizyonlar (build sonrası)

### 2026-06-20 — C1 revize: "triyajı öne al" + P0 güvenlik delikleri
Codex karşılaştırma raporu + dosya-düzeyi inceleme sonrası, kullanıcı onayıyla:

- **C1 revize edildi.** Eski hâli: "brainstorming kapısı **her zaman**". Sorun: her creative/build iş `brainstorming` (tasarım+onay) → `writing-plans` (plan dosyası+decomposition) zincirine giriyordu; inline-vs-devret (asıl maliyet kararı) ise ancak `execution-routing`'de veriliyordu. Yani 3 satırlık değişiklik bile peşin olarak onay+plan+decomposition maliyeti ödüyordu — bu, skillset'in var oluş sebebi olan "her işe aynı tören" belasını geri getiriyordu (§1 ile çelişki).
  - **Yeni hâl:** Maliyet/boyut **triyajı `using-cost-oriented-workflow`'da en başa alındı** (brainstorming/plan'dan ÖNCE). Trivial + sıkı-bağlı + net iş → **light path** (tek satır mutabakat + inline + verify, **plan dosyası yok, tasarım-onay kapısı yok**). Ambiguous/messy → brainstorming. Net ama çok-adımlı → doğrudan writing-plans. Kapı kalktı değil, **boyuta göre ölçeklendi**; "kod öncesi mutabakat" HARD MUST'ı korunur ama trivial işte mutabakat = konuşmadaki tek satır (kâğıt değil). Eşik, `execution-routing`'in inline testiyle aynı (tek altyapı, iki irtifa).
  - Dokunan dosyalar: `using-cost-oriented-workflow` (flow + hard rules + judgment + where-to-go-next), `brainstorming` (gate dili), iki komut.
- **Main/master guard (yeni HARD rule, scoped).** "main/master'da non-trivial işe sessizce başlama" kuralı eskiden yalnız production-gated `using-git-worktrees` içindeydi → standard modda main koruması yoktu. Entry skill'in hard rules'una eklendi (trivial inline edit'e izin verecek şekilde sınırlı).
- **systematic-debugging geri eklendi (özlü).** v1'de "OPSİYONEL/alınmadı"dı. Gerekçe: cost-conscious kullanıcı için bug-thrashing en pahalı token-yakma biçimi; kök-neden disiplini bir **maliyet** skill'idir. `execution-routing`'in retry-2'sinin önüne bağlandı.
- **Worktree native-tool tercihi geri taşındı.** Cost'un `using-git-worktrees`'i doğrudan `git worktree add` diyordu; harness native worktree aracı (`EnterWorktree` vb.) sunduğunda bu phantom-state yaratır. 6.0.0'ın Step 0 (zaten-izole mi) + Step 1a (native tool) + ignore/baseline çekirdeği özlü hâlde geri eklendi.
- **Inline iş artık commit'lenir.** `execution-routing` inline path'i commit zorunluluğu tanımlamıyordu; `review-package` `BASE..HEAD` (sadece commit'li) okuduğu için commit'lenmemiş inline değişiklikler whole-work review'a girmiyordu. Inline path'e commit adımı eklendi.

### 2026-06-20 — P1: profesyonel bütünlük + bakım güvenliği
P0'ın hemen ardından, aynı oturumda:

- **Yapısal validator eklendi** (`tests/validate-structure.mjs` + `package.json` → `npm run check`, **sıfır bağımlılık**, Node built-ins). Manuel-sync modelinin emniyet kemeri: JSON geçerliliği + manifest tutarlılığı, frontmatter + `name==dizin`, relative link çözünürlüğü, qualified cross-ref (skill **veya** komut), ve birkaç gevşek "policy invariant" (triyaj light-path, main-guard, anchor header, `HEAD~1` uyarısı, Iron Law'lar). **71 check, hepsi yeşil.** İçerik-cümlesine değil **yapıya** bakar → içerik düzenlemelerinden sağ çıkar.
- **`finishing-a-development-branch` (özlü) eklendi** + `execution-routing`'e **terminal** olarak bağlandı: tüm birimler bitince **bir whole-work review** (`requesting-review` whole-work scope, `review-package MERGE_BASE HEAD`) → sonra verify → merge/PR/keep/discard → cleanup. Eskiden loop her task'ta ledger'da bitiyordu; cross-unit entegrasyon kapısı yoktu.
- **`receiving-code-review` (özlü) eklendi** + `requesting-review` loop'una bağlandı. Senin **orijinal derdine** doğrudan denk gelir: performatif "haklısın" yok; controller reviewer-subagent bulgularını **yargılar**, otomatik uygulamaz; plan'a aykırı bulgu insana çıkar.
- **Pre-flight plan conflict scan** `execution-routing`'in başına eklendi (ilk dispatch öncesi planı bir kez çelişki için tara, bulguları tek batch soru yap; temiz tarama → sessizce devam).
- Skill sayısı **11 → 13**.

**Hâlâ kapsam dışı (P2, sonraki tur):** production implementer raporunda explicit RED/GREEN evidence · hook `run-hook.cmd` WSL-`bash.exe` filtresi · `task-brief` "cannot collide" yorumu düzeltmesi · `session-start` `<EXTREMELY_IMPORTANT>` ton tutarlılığı.

### 2026-06-20 — Karar: named-agent yok, self-contained kal (✅ kullanıcı onayı)
agentic-superpowers'ın 6 tool-izolasyonlu agent'ı (`scoped-implementer`, `spec-reviewer`, `code-quality-reviewer`, `debugger`, `security-auditor`, `plan-critic`) incelendi; rolleri cost'unkilerle birebir örtüşüyor. **Karar: cost bunları kullanmaz; general-purpose subagent + her dispatch'te açık model yaklaşımında kalır.** Gerekçe: (1) bir başka plugin'in agent'ını dispatch etmek cost'u **runtime-bağımlı** yapar — agentic-superpowers zaten `settings.json`'da devre dışı (`false`) ve geçiş tamamlandı; bu, A3/I'nin reddettiği tam kırılganlık; (2) altı rol de general-purpose + açık model + bounded prompt ile zaten karşılanıyor; (3) "çağrılan şey parametrelenemez, kendi kopyamız" tezi agent'lar için de geçerli. **Tek ödün:** reviewer'larda tool-düzeyi read-only zorlaması yok (cost'ta prompt-düzeyi "do not mutate"); bireysel/production-dışı iş için kabul edilebilir, diff'te yakalanır. **İleride hard tool-izolasyonu istenirse:** ödünç alma — cost-namespace'li **kendi** agent'larını port et (P2). Mevcut durum: cost temiz, named-agent/`agentic-superpowers:` referansı **sıfır** (doğrulandı).

### 2026-06-20 — P2: sağlamlaştırma/cila (tamam)
- **Production RED/GREEN evidence** geri eklendi: `implementer-prompt.md` rapor formatı + `test-driven-development` skill'i. Production'da rapor **RED** (önce başarısız test, doğru sebeple) → **GREEN** (sonra geçen) izini göstermeli; salt final-green TDD kanıtı değildir.
- **Hook WSL-bash filtresi** (`run-hook.cmd`): `where bash` dalı artık `System32\bash.exe`'yi (WSL launcher) atlayıp ilk non-WSL bash'i kullanır — Git Bash standart konumda yoksa "command not found + exit 0" gürültüsünü önler. (Git-path kontrolleri önce gelir; bu yalnız fallback'i sağlamlaştırır. Batch tarafı syntax-incelendi; WSL'li makinede davranışsal test edilmedi.)
- **`task-brief` / `review-package` collision yorumları** dürüstleştirildi: "concurrent sessions cannot collide" yanıltıcıydı — `task-N-brief.md` aynı-repo + aynı-task'ta paylaşılır (izolasyon için explicit OUTFILE); `review-package` zaten aralık-isimli, yorumu buna göre düzeltildi.
- **`session-start` tonu** skill felsefesiyle hizalandı: `<EXTREMELY_IMPORTANT>` sarmalayıcı kaldırıldı, sakin/yapısal çerçeveyle değiştirildi ("anti-drift yapıda, tonda değil"). Hâlâ geçerli JSON üretir + entry skill gömülü (doğrulandı).
- Sürüm **0.2.0 → 0.2.1**. Roadmap'in **P0 + P1 + P2'si tamam.**

### 2026-06-21 — P3: risk-matrisi birleştirmesi (canlı dogfood + Codex debate sonrası)
**Provenans:** Skill gerçek bir repoda (`api-auto-test`, zero-config Gemini feature) 0.2.1 ile dogfood edildi. Motor doğrulandı (triyaj doğru ayrıştırdı, main-guard ateşledi, plan==truth, adjudication, canlı verification). **Tek sistemik tema:** model "judgment" gördüğü her yerde maliyet lehine **review/bağımsızlık kapısını** kırpıyor (per-task review atlandı; hassas auth'u Opus kendi okudu; Critical-fix sonrası re-review atlandı; constraints pointer ile verildi; gereksiz checkpoint kondu). Codex (statik, test-öncesi) bağımsız olarak aynı yere çıktı (#2 light-path risk-kör, #7 validator behavioral değil). İki yöntemin yakınsaması → yüksek güven.

**Merkez karar (Codex'in çerçevesi, benimkinden üstün):** Dört düzeltmeyi ayrı kural diye eklemek yerine **risk'i contract'ta birinci-sınıf alan + tek merkezî review matrisi** yap. Risk, boyut/maliyetin tek başına karar verdiği her yerde devreye girer; karar **bir kez** verilir, her skill onu okur. *Risk, maliyetin asla sıkıştıramayacağı boyuttur* — review **derinliği** maliyetle ölçeklenir ama matrisin "required" dediği kapılar pazarlık edilemez.

**ŞİMDİ kodlanan — INVARIANT'lar** (ikili güvenlik; risk-güdümlü, veri-güdümlü değil):
0. **Spine:** `using-cost-oriented-workflow`'da Risk sınıfı (low/elevated/high) + hard-exclusion listesi + blast-radius ilkesi + review matrisi. Diğer skill'ler buradan okur.
1. **Light-path hard exclusions** (liste **+** ilke — Codex: ikisi birden, yoksa model "bence düşük risk" diye rasyonalize eder). Küçük kod ≠ düşük risk.
2. **Review modeli:** default self-review; hassas/high delegated → bağımsız Sonnet reviewer; planlı işin sonunda 1 zorunlu whole-work review; Critical/Important fix sonrası **hedefli** zorunlu re-review (önceki bulgular + fix aralığı + etkilenen seam, taze instance).
3. **Tek final-review sahibi:** entry flow'daki duplicate `requesting-review` node'u kaldırıldı; execution-routing terminali sahiplenir.
4. **Continuous cadence + STOP koşulları** anchor'da tek satır.
5. **Worktree overlap:** örtüşen dosya = daima sequential; worktree izolasyondur, paralelleştirme izni değil.
6. **Finishing base bug:** base **branch** tespit/kaydedilir (merge-base SHA branch sanılmaz); develop/upstream; başlangıç branch'i plan/ledger'da.
7. **Production isolation başarısızsa kullanıcıya sorulur** (work-in-place'e otomatik düşme yok).
8. **Commit policy ayrımı:** planlı birim default `per-unit`; light-path/trivial zorlamaz; `review-package` working-tree diff'i de gösterir (review doğruluğu commit'e bağlı kalmaz).
9. **Pre-flight gerçek checklist adımı** + plan self-review mid-flight edit sonrası tutarlılığı yeniden tarar (dogfood'da plan 2 çelişkiyle gitti: externalToken `GEMINI_API_KEY`/JWT karışıklığı + apiKeyEnv "ignored" vs "defaulted").
10. **Brief otomasyonu:** `task-brief` Anchor+Global Constraints+Task'ı tek dosyada taşır; reviewer kısa constraint bloğunu inline alır + brief'e pointer (Q4 — manuel verbatim kopyalama yok).

**ERTELENEN — HEURISTIC'ler** (5–8 senaryo dogfood ile kalibre, şimdi sabitleme): 40-60/80-100 satır eşikleri · hangi "Important" tam vs hedefli re-review ister · Opus-escalation maliyet eşiği · hangi elevated task per-task review alır · pointer/verbatim token eşiği.

**Benim guardrail'lerim (kuruluş anti-tören tezini koruyan):**
- **Light path'i risk-makinesinden koru:** Risk per-task, **yalnız elevated/high'da yazılır**; low **implicit default**. Trivial işe `Risk/Reasons/Review` bloğu doldurtma.
- **Anchor şişmesini engelle:** global anchor minimal (MODE/ROUTING/RESUME + **tek satır** CADENCE/STOP); COMMIT POLICY yalnız non-default'ta; Risk per-task'ta.
- **Q4 kanıt nüansı:** reviewer pointer'la bir Critical buldu ama o logic bug'dı, constraint ihlali değil → "pointer constraint'i iyi tarttı" kanıtı yok; ama otomasyon çözümü kanıttan bağımsız doğru.

**Q1–Q4 nihai:** Q1=(a) self+son+Critical-re-review · Q2=(a) hassas→bağımsız Sonnet · Q3=(a) continuous+stop-list · Q4=hibrit, brief-otomasyonuyla.

**Uygulandı (2026-06-21):** 8 skill + 2 script + validator dokunuldu; scriptler gerçek temp git repo'da davranışsal test edildi (task-brief: constraints+task çıkarımı, fence-aware, eksik-task exit≠0; review-package: committed+uncommitted+historical-range). Validator **75/75**. Sürüm **0.2.1 → 0.3.0** (mimari değişiklik: risk-matrisi spine'ı). Yeni skill eklenmedi (Codex: mevcut olanları birleştir).

### 2026-06-21 — P4: v0.3 dogfood + Codex eleştirisi → karar seti (KAYIT — henüz uygulanmadı)
**Provenans:** v0.3.0, gerçek bir yarım Spring Boot repo'da (`weather-api-microservices-webclient-redis`) dogfood edildi. Kullanıcı 8 task'ı (gömülü Task6-vs-7 çelişkisi + overlap'lı T1/T8 dahil) **tek session'da karışık backlog** gibi verdi.

**Doğrulanan (karar-davranışı — güçlü):** risk-routing (küçük auth → light-path değil, bağımsız review); hassas delegated → bağımsız Sonnet (Opus self-review değil); Critical-fix sonrası taze-instance hedefli re-review; plan çelişkisi kod yazılmadan triage'da yakalandı + blocker; continuous cadence (yalnız gerçek STOP'larda durdu — "failed-baseline STOP condition" anchor sözlüğünü kullandı); overlap'lı T1/T8 tek birime birleşti; receiving-code-review (gürültülü whole-work review körlemesine uygulanmadı, her bulgu kodla karşılaştırıldı). Codex skorları: bu alanlar 9/10.

**DOĞRULANMAYAN (dürüst kapsam düzeltmesi — "near-total success" iddiam fazla iyimserdi):**
- **Davranışsal verifikasyon (4/10):** high-risk auth işi compile + review ile bırakıldı; **sıfır test** yazıldı. "Full mvn test passes" denildi ama repoda hiç test yok → 0 test çalıştı (vacuous). Expired→401, refresh≠access, type=access gibi davranışlar unit/MockMvc ile test edilebilirdi.
- **Reviewer discovery (5/10):** 3 Critical reviewer tarafından *keşfedilmedi*; controller (Opus) şüphelendi, reviewer **doğruladı** (refresh-token prompt'u açığı cevabıyla verdi — subagent_prompts satır 34). "Review sistemi buldu" kanıtı yok. Ayrıca reviewer kalibrasyonsuz: false-positive üretti (reset-password NPE Spring tarafından engelleniyor; WeatherResponse Serializable self-çelişki) VE iki gerçek seam riskini **kaçırdı** (type=access eski tüm access token'ları geçersiz kılıyor = rollout/backward-compat kararı; weather servisi tüm upstream 4xx'i 404'e çeviriyor).
- **Anti-drift (6/10):** "service busy → continue" sadece aynı-context kesintiden dönüş; ledger'ın yeniden okunduğu kanıtı yok. Gerçek test = Task 2 sonrası kes, yeni instance yalnız plan+ledger+git görsün, Task 3'ten devam etsin, tamamlananı re-dispatch etmesin.
- **Maliyet iddiası (3/10):** ölçülmedi. Görünen iki ajan bile 68k subagent token yaktı; toplam daha yüksek. "Premium-model maliyeti düştü" makul ama **"token economy" kanıtsız.**

**Sahiplendiğim bug (Codex buldu):** `review-package` untracked dosyaların yalnız **adını** yazıyor, **içeriğini değil** (`git ls-files --others`). P3'teki working-tree desteği eksik; testim de yalnız dosya adını grep'ledi → kaçırdım. İmplementer commit etmeyip working-tree'de bırakınca (T4'te 6 yeni dosya) reviewer içerikleri pakette göremez; ancak dosyaları ayrıca açarak görebildi (paket-only disiplinini deldi). **P0.**

**Anahtar reasoning içgörüsü:** whole-work prompt'u "verified=true ... **do NOT flag**" demiş → bu benim **kendi don't-pre-judge kuralımı** (requesting-review) ihlal ediyor. Ders: bir kural meşru bir ihtiyacı (insan kararını reviewer'a iletmek) karşılamıyorsa, model kuralı **delerek** karşılar. Düzeltme kuralı yükseltmek değil, **meşru yolu vermek**: insan kararı reviewer'a "do NOT flag" diye değil **"binding requirement — implementasyonu buna karşı denetle"** diye verilir. (Skill'in kendi "yapı, ton değil" tezinin kendine uygulanması.)

#### KARAR SETİ (uygulama sırası)

**A — Kod/doğruluk düzeltmeleri (net, önce):**
1. `review-package`: untracked **içeriği** ekle (`git diff --no-index /dev/null <file>`); binary → metadata; **içeriği** doğrulayan fixture testi. *(benim bug'ım; P0)*
2. `COMMIT POLICY: controller-per-unit (default) | implementer | user-owned | none`; `implementer-prompt` "Commit your work" → "do not commit; controller review sonrası commit'ler". *(#1'e bağımlı: commit'siz working-tree ancak #1 ile reviewable)*
3. `verification-before-completion`: "0 failure" ≠ "tests passed"; **test sayısı** raporlanmalı; "no tests discovered" öyle belirtilmeli (vacuous yeşil yasak).
4. Manifest (`plugin.json`) açıklaması: "Opus plans and reviews" bayat → "Opus plans/routes/adjudicates; bağımsız Sonnet reviews; Sonnet writes".

**B — Kalibre prose (sonra):**
5. **P-A (genişletilmiş):** high-risk acceptance → davranışsal verify **planlamada tasarlanır** (sadece Critical-fix sonrası reaktif değil); kabul edilmiş Critical/Important davranış hatası, hatayı yeniden üreten minimal otomatik test olmadan kapanmaz; test altyapısı yoksa controller sessizce atlamaz/scaffold etmez → **kullanıcı kararı**. Bağla: writing-plans (behavior-level verify) + verification-before-completion (vacuous-yeşil yasağı) + requesting-review (re-review testin eski bug'ı kilitlediğini doğrular).
6. **P-C:** reviewer bulguları **causality (introduced|worsened|pre-existing) + reachability + impact + severity** taşır; per-task verdict yalnız introduced/worsened sayar; pre-existing ayrı risk bölümünde raporlanır. + don't-pre-judge ihlali düzeltmesi (insan kararı = "binding requirement", "do NOT flag" değil). + **discovery review:** high-risk'te en az bir **ham-diff (beslenmemiş) security review** (controller kör noktaları için).
7. **P-B:** pre-existing Critical ayrı kapı (fix-under-new-scope vs explicit-risk-acceptance), Minor hardening listesiyle karıştırılmaz; secret ise env-var **yetmez** → rotate + git-history exposure değerlendirmesi.
8. **P-D (rafine):** task'ları **yalnız aynı sorumluluk + aynı seam** ise birleştir (sadece aynı dosya yetmez); formal pre-flight korunur.

**C — Pivot (asıl yatırım — Codex'in ana tezi, kabul):** Artık prose ekleme; **ölç.** Küçük **behavioral eval** (discovery/confirmation ayrımı) + **maliyet telemetrisi** (run başına token). Sonra 5-8 dogfood ile **eşikleri ve maliyeti ölç**, kural ekleme değil. Kanıtlanmamış iki iddia (davranışsal kalite, token-economy) yalnız ölçümle kapanır.

**Durum:** A **uygulandı (2026-06-21)**, B + C bekliyor.
- **A1** ✅ `review-package` artık untracked **içeriği** gösteriyor (`git diff --no-index /dev/null`; binary → metadata). + Yeni **fixture script testi** (`tests/scripts.test.sh`, `npm run test:scripts` / `npm test`) — düzelttiğim bug'a kalıcı regression (P-A'yı dogfood eder). 11 script check.
- **A2** ✅ `COMMIT POLICY: controller-per-unit (default) | implementer | user-owned | none` (execution-routing'de yeni bölüm); implementer-prompt 3 yerde düzeltildi ("Commit your work"→"do not commit; controller review sonrası commit'ler", "before committing"→"before reporting", "Commits created"→"Files changed"); return protocol tutarlandı. A1'e bağımlıydı (commit'siz working-tree ancak A1 ile reviewable).
- **A3** ✅ `verification-before-completion`: "0 failure" ≠ "tests passed"; gate'e test sayısı, tabloya "N ran, 0 failed (N>0)", ve vacuous-yeşil yasağı (P-A'ya köprü).
- **A4** ✅ manifest açıklaması (plugin.json + marketplace.json): "Opus plans and reviews" → "plans/routes/adjudicates; bağımsız Sonnet reviewers; Sonnet writes".
- Doğrulama: `npm test` 75 yapısal + 11 script davranışsal, hepsi yeşil. Sürüm **0.3.0 → 0.3.1**.

**B uygulandı (2026-06-21)**, C bekliyor.
- **B5 (P-A genişletilmiş)** ✅: risk matrisine "tests follow risk" (high-risk → behavioral acceptance; fixed Critical → regression test; no-infra → surfaced decision); `writing-plans` (high-risk behavioral acceptance); `requesting-review` (re-review regression testi doğrular); verification tarafı A3'te yapıldı.
- **B6 (P-C)** ✅: `task-reviewer-prompt` + `code-reviewer` → **causality** (introduced|worsened|pre-existing) + reachability + ayrı "Pre-existing" bölümü; verdict yalnız introduced/worsened; **binding-requirement framing** (`preparing-subagent-prompts` + `requesting-review` — gözlenen "do NOT flag" ihlalinin düzeltmesi); **discovery review** (high-risk → ham-diff beslenmemiş security review); `code-reviewer` integration-lens (dogfood'da kaçan backward-compat/rollout + error-mapping seam riskleri).
- **B7 (P-B)** ✅: pre-existing Critical ayrı kapı (fix-under-scope vs recorded risk-acceptance) — `requesting-review` + `receiving-code-review`; secret → env-var yetmez, **rotate + git-history exposure**.
- **B8 (P-D rafine)** ✅: `writing-plans` — merge yalnız aynı sorumluluk + aynı seam (aynı dosya yetmez); overlap sequenced.
- Ek ripple düzeltmeleri (bu turda yakalandı): `preparing-subagent-prompts`'ta return "commits"→"files changed" (A2) + "verbatim copy"→brief-carries (Q4).
- Doğrulama: `npm test` (75 + 11) yeşil; "do NOT flag" anti-pattern guard'lı; causality iki reviewer prompt'unda. Sürüm **0.3.1 → 0.3.2**.

**C, v0.4.0 ile uygulandı; aşağıdaki release kaydına bak.**

### 2026-06-22 — v0.4.0: hardening, bounded review ve ölçüm altyapısı

**Kaynak sınırı:** Otoriter repo Desktop’taki git kaynağıdır. Claude cache’i
kurulu çıktıdır; hiçbir fazda elle patchlenmedi. Değişiklikler baseline + altı
faz commit’i olarak ilerletildi.

**Superpowers’tan alınan workspace çözümü:** Official 6.0.3’teki yazılabilir
çalışma alanı fikri benimsendi, fakat cost’un worktree/ledger ihtiyaçlarına göre
daraltıldı. Artifact’lar `.git` altına değil, her checkout’un
`<repo-root>/.cost-oriented-agentic-workflow/run/` alanına yazılır; alan kendini
ignore eder, `git add -A` içine giremez ve linked worktree’ler paylaşmaz. Legacy
`<git-dir>/cow/progress.md` kopyalanır ama silinmez. `git clean -fdx` kaybına
karşı plan + `git log` fallback’i korunur.

**Review scope ve repository-state kararı:** `review-package` task modunda
committed/staged/unstaged/untracked içeriği yalnız izinli repo-relative yollar
için üretir; traversal/absolute path reddedilir, binary yalnız metadata verir.
Whole-work mod committed range ile sınırlıdır ve güncel dirty tree’de exit 4
verir. Default planlı yürütme temiz tree ile başlar.

**Mode-aware review ve bounded remediation:** Standard-low self-review + final
whole-work review ile ucuz kalır; standard-high ve production’daki her planlı
task bağımsız Sonnet review alır. Accepted Critical/Important fix taze targeted
re-review ister. Her task/final review en fazla iki autonomous remediation wave
alır; aynı bulgu için ikinci kör fix yoktur ve `budget exhausted != approved`.

**Resume/base/commit sözleşmesi:** Ledger `PLAN_FILE`, `MODE`, `COMMIT_POLICY`,
`BASE_BRANCH`, `MERGE_BASE_SHA` değerlerini Task 1’den önce bir kez pinler. Final
review ve finishing aynı immutable merge-base’i kullanır; feature upstream base
sanılmaz; detached HEAD local merge göstermez. `COW_ENTRY_INJECTED` compaction’da
duplicate entry load’u önler. Default commit policy `controller-per-unit` kalır;
implementer yalnız açık `implementer` politikasında commit atar.

**Output ve verification bütçesi:** Implementer dönüşü sekiz satırla, log yerine
komut/test sayısı/sonuç ve ilgili RED-GREEN parçalarıyla sınırlıdır. Reviewer tüm
Critical/Important bulguları korur, en fazla üç Minor döndürür. Finishing final
verification’ın sahibidir; aynı-state kanıtı tekrar kullanılabilir, merge daima
yeniden test edilir. Runtime prose hard ceiling 86.000 byte; beş sıcak dosya
v0.3.2 boyutunun %110’unu geçemez.

**C pivot kapandı:** Offline analyzer gerçek Claude Code ana oturumu + subagent
JSONL’lerinden input/output/cache/message kırılımı üretir, malformed satırları
atlayıp sayar ve fiyat verilmedikçe dolar iddiası yapmaz. Altı hidden-ground-truth
fixture discovery/confirmation, recall, precision, severity, causality, scope
discipline ve valid finding başına token ölçümünü tanımlar.

**Bilinçli ayrışmalar:** Standard-low task’lara zorunlu reviewer veya standard
moda zorunlu worktree eklenmedi; default implementer-commit yapılmadı; `-U10`
ölçümsüz düşürülmedi; prompt-file indirection, wholesale SDD metni, full
Drill/session-driver ve named-agent bağımlılığı alınmadı. Amaç minimum maliyette
stabil ve güvenilir kişisel-ölçek çözüm olarak kaldı.

**Doğrulama:** Runtime prose 86.000 byte altında; workspace/review helper’ları
gerçek temp git repo ve linked worktree üzerinde; token analyzer sentetik ve
gerçek session ile; altı fixture geçerli unified diff olarak doğrulandı. Release
sürümü davranışsal değişiklikler nedeniyle `0.4.0`.

### 2026-06-23 — v0.4.1: routing kaçış yollarının kapatılması + reproducible release

**Provenans:** v0.4.0 gerçek bir Flutter hata-ayıklama görevinde dogfood edildi.
Debugging *kalitesi* geçti (kök-neden disiplini, doğru teşhisler), ama routing
*ekonomisi* üç noktada sızdırdı. Bu **patch** yama yalnız o üç deliği kapatır ve
release artefaktını sağlamlaştırır; mimari (Opus controller / Sonnet writer /
risk maliyeti ezer / bağımsız review / bounded retry-remediation / kanıt-temelli
verification / sıfır runtime bağımlılık) değişmez — 0.5.0 değildir.

**Neden debugging geçti ama routing ekonomisi başarısız oldu:** Model kök-nedeni
doğru buluyor; ama "judgment" gördüğü her yerde maliyet lehine kapıyı kırpma
sistemik teması (v0.3'te review/bağımsızlık kırpma) burada *routing/delegasyon*
kırpmaya kaydı. Teşhis doğru, fakat token-ağır işi controller'da tutma
rasyonalizasyonu üç biçimde çıktı:

1. **"Küçük oldukları için inline incelerim."** Ucuz domain map disjoint problem
   alanlarını doğru ayırdı, sonra "fix'ler küçük" diye bağımsız investigator'lara
   devretmek yerine controller-led derin trace yaptı. Düzeltme: disjoint-domain
   teşhis delegasyonu **eventual fix boyutundan bağımsız** karar verilir;
   görünür küçüklük token-ağır araştırmayı controller'da tutamaz; küçüklük yalnız
   teşhis SONRASI implementation routing'i etkiler. Shared kök-neden makulse
   sıralı (tek) teşhis hâlâ geçerli — tetik semptom sayısı değil, kanıtlanmış
   disjoint-domain haritasıdır. (Otoriter: `systematic-debugging`; kısa referans:
   `dispatching-parallel-agents` + entry skill.)

2. **Tracked diagnostic instrumentation eski route'u sessizce devraldı.** Logging
   interceptor / mock-server dependency / harness eklemek "hâlâ teşhis" sanılıp
   light route'ta kaldı. Düzeltme: read-only teşhis **ilk tracked diagnostic
   edit'te biter**. Edit'ten ÖNCE görünür `Re-route:` receipt (sonra değil);
   triage'a dönüş; dependency/harness/config/schema **planlı elevated diagnostic
   unit** olur (writing-plans → execution-routing). Kullanıcının tekniği
   onaylaması "bu yöntemi kullanabilir miyiz?"i cevaplar, "bu genişlemiş iş nasıl
   yürütülür?"ü değil — eski light-inline route'u korumaz. Geçici instrumentation
   açık bir cleanup disposition taşır: kanıt sonrası kaldır, ya da gerekçeli
   regression test olarak bilinçli tut. (Otoriter: `systematic-debugging` +
   launcher.)

3. **Aynı dosya bağımsız outcome'ları birleştirdi.** İki bağımsız kullanıcı-görünür
   outcome aynı dosyada diye tek light-inline değişikliğe çökertildi. Düzeltme:
   birim sınırı **outcome + sorumluluk + doğrulama seam'i**; dosya kümesi değil,
   sahiplik/sıralama bilgisidir. İki bağımsız outcome → ayrı sıralı unit'ler VEYA
   her outcome için ayrı acceptance + ayrı regression taşıyan tek delegated batch;
   asla tek light-inline. "Aynı dosya + her fix küçük" light yol lisansı değildir.
   Mevcut "same-file ≠ same-unit" ilkesi korunur (overlap sıralanır, asla
   paralelleştirilmez), enforcement'ı güçlendirilir. (Otoriter: `writing-plans`;
   `execution-routing` + entry skill ile hizalı.)

**Merkezîleştirme, şişirme değil:** Her kural tek otoriter skill'de yaşar, ötekiler
kısa referans verir. Prose 86.000 byte tavanı altında kalır: entry skill'deki
`writing-plans` ile birebir kopyalanmış anchor bloğu referansa indirgendi →
85.432/86.000. Tavan testle korunur.

**Neden 0.5.0 mimarisi ertelendi:** repository-intake skill, repo-snapshot helper,
`agents/` tanımları, makine-okunur workflow state engine, aktif `PreToolUse`
enforcement hook, tam discovery/implementation dual-routing state machine,
otomatik runtime cost feedback ve session driver kapsam **dışı**. Gerekçe: bunlar
mimari değişiklik; patch yalnız ölçülmüş üç deliği kapatmalı, yeni bağımlılık/
review tier/retry-remediation bütçesi getirmemeli. Teşhis routing'i ile sonraki
implementation routing'ini ayıran küçük kelime netleştirmeleri yapıldı ama tam
dual-routing mimarisine dönüştürülmedi.

**Yeni gate'ler:** 12 yapısal invariant (`validate-structure.mjs`); altı route-only
pressure-test fixture (`tests/eval/routing/` — üç release-blocker + üç regression
control) + şema validator (`RoutingFixtureContractTests`); canlı route-only dogfood
protokolü (`DOGFOOD.md`). Validator artık ignored workspace/`dist`'i taramaz →
deterministik check (üretilen artefakt bir check ekleyemez/düşüremez).

**Release sağlamlaştırma:** `hooks/session-start` git index exec bit (100644 →
100755 — helper testi ve SessionStart onu doğrudan çalıştırır); reproducible
`scripts/build-release.sh` (git archive: `.git`/`node_modules`/`dist`/workspace
hariç, exec bit korunur, deterministik `dist/<ad>-<sürüm>.zip`); bağımsız
`tests/release-artifact.test.sh`; eval runner artık Python 3'ü **çalıştırarak**
seçer (Windows "App execution alias" PATH'te çözülüp çalışmıyordu) + `py`
launcher; `dist/` gitignore; `release:build`/`test:release`/`verify:all`.

**Canlı dogfood (Opus controller, standart mod, `claude --plugin-dir <kaynak>`):**
route-only dry-run; her run route receipt + ilk routing aksiyonu + gereken
`Re-route:`te durur, implement etmez. Sonuç: üç release-blocker (small-disjoint-
diagnosis, tracked-diagnostic-harness, same-file-independent-outcomes) **3/3
temiz**; üç regression-control (unknown-repo-disjoint-domains, warm-repo-trivial-
edit, dirty-working-tree-preservation) **1/1 temiz**. İlk dry-run harness'i
"subagent dispatch etme" kısıtıyla A/D'yi confound etmişti (investigator dispatch'i
bastırdı); harness "dispatch'i tarif et, yürütme" diye düzeltilip yeniden koşuldu
(değişen-bağlam rerun, sonuç-seçme değil). Kanıt ignored
`.cost-oriented-agentic-workflow/eval/` altında, commit'lenmez.

**Doğrulama ve sürüm:** structural (187) + helper (40) + eval (9) + bash syntax +
prose budget (85.432) + strict manifest validation + release-artifact testi
yeşil; canlı blocker dogfood 3/3×3 + control 1/1×3. Tüm pre-release gate'ler
geçtiği için sürüm **0.4.0 → 0.4.1** (`plugin.json` + `marketplace.json` +
`package.json` birlikte).

### 2026-06-24 — v0.4.2: kaynak repo / runtime paket ayrımı (cleanup)

**Kapsam:** yalnız temizlik + paketleme. Routing, davranış, mimari, review/
remediation, standard/production semantiği değişmez. 0.4.1 dogfood'unda görüldü
ki dizinden kurulum (directory-marketplace) çalışma ağacının TAMAMINI cache'e
kopyalıyor — `tests/`, `docs/`, `scripts/` ve hatta ignored dogfood evidence
dahil. Çözüm: kaynak repoyu (geliştirme ağacı) minimal runtime paketinden ayır.

**Kararlar:**
- **Geliştirme reposu eksiksiz kalır.** `tests/`, `docs/`, `scripts/`, eval
  fixture'ları, `CHANGELOG.md`, `.git` geçmişi korunur — geçerli geliştirme
  varlıkları; yalnız runtime pakete girmezler.
- **Runtime dağıtımı elle değil, üretilir.** `scripts/build-runtime-package.mjs`
  git-tracked içerikten deterministik bir runtime dizini + ZIP + SHA-256 +
  manifest üretir. Elle dosya kopyalama reddedildi: kaynak değişince paket
  bayatlar ve allowlist insan elinde drift eder.
- **Allowlist, denylist-only kopyalamadan güvenlidir.** Paket explicit bir
  allowlist'ten kurulur (`.claude-plugin`, `commands`, `skills`, opt-in `hooks`,
  `README.md`, `LICENSE`) ve ayrıca denylist ile çapraz denetlenir. İleride
  eklenen bir geliştirme dosyası sessizce pakete sızamaz — allowlist dışındaysa
  hariç kalır.
- **Runtime çıktısı repo DIŞINDA.** Varsayılan `../cost-oriented-agentic-
  workflow-runtime/`. Repo içinde üretmek dizinden-kurulumda cache'i yeniden
  kirletirdi; dışarıda tutmak marketplace/cache kontaminasyonunu kökten önler.
  Builder repo-içi veya `.git`/`skills`/`commands` output path'lerini reddeder
  ve yalnız kendi versiyonlu çıktı klasörünü/ZIP'ini değiştirir; rastgele dizini
  asla recursive temizlemez.
- **Yalnız git-tracked içerik.** Paket çalışma ağacından recursive kopyalanmaz;
  `git show HEAD:<path>` / `git archive` kullanılır → `skills/` veya `hooks/`
  içine bırakılmış untracked dosyalar sızamaz. Exec bitleri (`session-start`,
  üç `execution-routing/scripts/*`, `run-hook.cmd`) korunur.
- **Güvenli temizlik.** `scripts/clean-generated.mjs` yalnız hardcoded bir
  allowlist'i (`dist/`, `.cost-oriented-agentic-workflow/eval/`) siler; `git
  clean -fdx` kullanılmaz (o, ignored workspace'i ve recovery state'i de
  silerdi). `.cost-oriented-agentic-workflow/run/` korunur.

Sürüm **0.4.1 → 0.4.2** (cleanup/packaging; davranış değişikliği yok). Testler
ve dogfood bu cleanup-only yamada bilinçli olarak yeniden koşulmadı; kurulum/
rollout yapılmadı. Sonraki mimari faz: **0.5.0**.
