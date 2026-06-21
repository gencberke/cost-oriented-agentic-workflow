# cost-oriented-agentic-workflow — Handoff / Bağlam Raporu

> Bu dosya tek başına yeterlidir. Bu projeyi hiç bilmeyen bir ajan yalnızca bunu
> okuyarak ne/neden/nasıl/durum hakkında tam bağlama sahip olmalı. Tasarım
> gerekçesinin Türkçe "karar defteri" sürümü: `docs/DECISIONS.md`. Skill
> içerikleri İngilizce (`skills/*/SKILL.md`).

> **Güncelleme — 2026-06-20:** Workflow bir **P0 revizyonundan** geçti (Codex
> karşılaştırma raporu + dosya-düzeyi inceleme sonrası). Bu rapordaki bazı
> ayrıntılar artık eskidir; güncel ve otoriter karar metni:
> **`docs/DECISIONS.md` → "Revizyonlar / 2026-06-20".** Özet: (1) **triyaj-öne-al**
> — trivial-inline iş artık brainstorming + plan dosyasını atlar (C1 revize);
> (2) **`systematic-debugging`** skill'i eklendi (§7'deki "alınmadı" ve §8 listesi
> bu ölçüde güncel değil); (3) standard-modda **main/master guard**; (4) worktree
> **native-tool tercihi**; (5) **inline iş commit'lenir**. Ardından **P1**: yapısal
> **validator** (`npm run check`, sıfır-dep), **`finishing-a-development-branch`** +
> final whole-work review wiring, **`receiving-code-review`**, ve **pre-flight plan
> conflict scan** → toplam **13 skill** + `tests/`.

---

## 0. Tek paragraf özet

`cost-oriented-agentic-workflow`, Claude Code'a özel, **token-ekonomisi odaklı**
bir agentic skillset (plugin). Çekirdek fikir: pahalı controller (**Opus**)
**planlar, yönlendirir ve gözden geçirir**; **token-ağır kod yazımını bir Sonnet
4.6 subagent yapar**; controller hafif kalır (özet/dosya/doğrulama okur, kod
gövdesi geri yüklenmez). `superpowers` 6.0.0'dan **fork + refactor** ile türedi,
**self-contained** (runtime bağımlılık yok). İki mod: **standart (varsayılan)** +
**production**. Durum: **inşa edildi + statik doğrulandı**, davranışsal dogfood
bekliyor (interaktif `/plugin install` gerekiyor).

Konum: `C:\Users\gencberke\Desktop\cost-oriented-agentic-workflow\` (kendi git
repo'su, henüz commit yok).

---

## 1. Köken & motivasyon (neden var?)

Bu skillset, bir **Flutter + SQLite okul projesi** ("Akıllı Ev Sistemi") session'ı
sırasında doğdu. O session'da Claude (Opus) **tüm dosyaları inline yazdı** — bu,
kullanıcının asıl amacını (token-ağır yazımı bir Sonnet alt-ajana devredip pahalı
Opus kapasitesini korumak) **ihlal etti**. Mevcut `agentic-superpowers` skillseti
"mekanik işi inline yap" derken, kullanıcının token-ekonomisi hedefiyle çakıştı.

Kullanıcı (Berke): Türkçe konuşan bir öğrenci; mobil/Flutter alanı değil; **Opus
pahalı bir model** ve plan yükseltemiyor, bu yüzden en çok token yakan toolların
(dosya yazımı) maliyetini düşürüp kodlama kapasitesini uzatmak istiyor.

Birlikte `superpowers`/`agentic-superpowers`'ın zayıflıkları teşhis edildi:

1. **Süreç-maksimalizmi / tek-beden-herkese-uyar ağırlık** — her işe aynı tören.
2. **"%1 kuralı" / zorlayıcı MUST dili** maliyet-fayda yargısını bastırıyor
   ("1% ihtimalle skill uygunsa MUTLAKA çağır").
3. Workflow'lar **soğuk-başlangıç keşfi** varsayıyor (bağlamı olan repo'yu yeniden
   keşfetmek).
4. **Subagent yanlılığı** (her task'ı devret) ya da tersi (her şeyi inline yaz) —
   ikisi de kalibrasyonsuz.
5. Gerçek amaç ne olursa olsun **sabit "mühendislik mükemmelliği"** optimize ediyor.
6. **Maliyet/bütçe farkındalığı yok.**

**Kök neden:** uyarlanabilir bir **kalibrasyon adımı** (amaç + risk + bütçe) eksik,
ve **yargı bastırılıyor**. Bu skillset tam da bunu düzeltmek için tasarlandı:
*"süreci, sonucu değiştirdiği yere harca — törenle değil."*

---

## 2. Çekirdek ekonomi & mimari

**Çekirdek ekonomi:** Opus planlar/yönlendirir/gözden geçirir · Sonnet 4.6
high-effort subagent reasoning yapıp kod yazar · controller hafif kalır (özet,
dosya listesi, doğrulama sonucu — kod gövdesi/diff geri yüklenmez).

**Mimari seçimi (iki aday tartışıldı):**

- **Mimari 1 — SEÇİLEN:** Opus plan/kontrat yazar → **scoped prompt alan Sonnet
  4.6 (high effort) reasoning yapıp kodu düşünür ve yazar** → geri **özet** döner.
  Gerekçe: en çok token üretim (kod yazımı) ucuz modele kayar; controller ince kalır.
- **Mimari 2 — REDDEDİLEN:** Opus kodu kendisi düşünür/yazar, sonra Haiki/low-effort
  bir "katip" ajan sadece yazıya döker. Reddedildi çünkü **üretim Opus'ta kaldığı
  için token tasarrufu sağlamaz** — asıl pahalı adım taşınmamış olur.

---

## 3. Verilen tasarım kararları (A–J, gerekçeleriyle)

Tüm kararlar kullanıcı tarafından onaylandı (`docs/DECISIONS.md`'de tam metin).
Özet:

- **A — Kimlik/kapsam:** Ad `cost-oriented-agentic-workflow`. Yalnız **Claude Code**
  için optimize. superpowers ile ilişki = **inherit + refactor**: değiştirdiğimiz
  orkestrasyon/routing/ton skill'lerini **sahipleniriz** (kendi özlü kopya),
  değişmeyen stabil teknikleri upstream'e yakın tutarız. Gerekçe: çağrılan bir
  skill **parametrelenemez** (ona "mod=standart, hafif ol" geçemezsin), kendi
  kopyamız daha kısa = daha az context, runtime kırılganlık yok.
- **B — Mod:** İki mod. **standart (varsayılan)** = maliyet aktif kısıt, her süreç
  adımı ihtiyaca göre ölçeklenir. **production** (`:production` komutu) = güvenilirlik
  maliyetin önünde. **Mid-session mod değişimi yok.**
- **C — Planlama/brainstorming:** Brainstorming kapısı **her zaman** (yoğunluğu
  isteğin dağınıklığına göre ölçeklenir). Task'lara bölme **zorunlu** (granülerlik
  karmaşıklıkla ölçeklenir). Kod öncesi her zaman bir plan/kontrat (hafif olabilir);
  **açık onay kapısı production'da** veya istenince.
- **D — Yürütme yönlendirmesi (kalp):** Mimari 1. **"Kontrat maliyeti" devret/inline
  kuralı** (bkz. §4). Yazan = **Sonnet 4.6 high**. Dönüş = **özet + değişen dosyalar
  + doğrulama** (kod gövdesi yüklenmez). **"Dikişleri pinle, içini serbest bırak"**
  (bkz. §5). Tutarlı öbekler tek pakette **batch**. Bağımsız öbekler **paralel**
  subagent + **katı non-overlapping dosya-sahipliği**. Subagent retry **en fazla 2**,
  sonra Opus'a döner. **standart'ta worktree yok** (sadece production/ayrıştırılamayan
  paralel iş).
- **E — Review:** **standart** = yazandan **farklı instance** bir bağımsız **Sonnet
  reviewer** (spec-uyum + build/doğrulama) + Opus yalnız **dikiş/diff düzeyinde** ince
  bakış (tam yeniden-okuma değil). **production** = derin review (Opus/Opus-ajan) +
  güvenlik-hassas ise **güvenlik-lensli reviewer**. Subagent basit işlerde kendini test
  eder. **"Kanıt olmadan bitti deme."**
- **F — Test:** standart = yalnız gerçekten gereken testler; production = detaylı.
  Testi **subagent yazar**.
- **G — Token/maliyet:** Controller hafif (özet al, büyük dosya yükleme). **Bağlamı
  olan repo'yu yeniden keşfetme YOK**; yeni/bilinmeyen repo'da büyüklüğe göre Explore
  ajan(lar)ı.
- **H — Dil: yargı vs MUST (kritik):** Çizgi = **ikili + atlanırsa felaket** olan
  şeyler **HARD MUST**; **sürekli ödünleşim** olanlar **yargı**. Uzun-session drift'ine
  karşı asıl çapa **kalıcı task-listesi/kontrat (yapı)**, blanket MUST tonu **değil**
  (bkz. §6).
- **I — Inherit/compose:** Kendi self-contained Claude Code plugin'i, kendi `skills/`
  dizini, superpowers'a runtime bağımlılık yok, **manuel ara-sıra sync**. Aktivasyon:
  **launcher komutu (default)** + opsiyonel SessionStart hook. **Mod, plan/task
  dosyasının başına yazılır** (compaction çapası).
- **J — Sınırlar/izinler:** Claude Code izin modeli korunur; tehlikeli komutlar
  otomatik onaylanmaz; subagent'lar aynı izin duruşu; geri-döndürülemez/dışa-dönük/
  güvenlik-hassas işler **onay ister** (HARD MUST); production'da plan-onay kapısı.

---

## 4. Merkez IP: "Kontrat maliyeti" devret/inline kuralı

superpowers her task'ı bir subagent'a devreder. Biz **her birim için ayrı karar**
veririz, çünkü devretmek ücretsiz değil (kontratı yazma + dispatch + dönüşü gözden
geçirme maliyeti var).

**Kıyas:** kendi-kendine yeten bir kontrat (scope + arayüzler + kabul kriterleri +
doğrulama komutu) yazmanın maliyeti vs kodu kendin yazmanın maliyeti.

- **INLINE (Opus kendi yazar):** tek küçük düzenleme / **`<~40-60` satır** / elindeki
  context'e sıkı bağlı değişiklik.
- **DEVRET (Sonnet writer):** **`≥2` dosya VEYA `≥~80-100` satır**, kendi içinde
  spesifiklenebilir.
- **BATCH edip devret:** çok sayıda küçük ilişkili dosya (overhead'i bir kez amorti et).

Eşikler kanun değil; **gerçek test: "kontrat koddan ucuz mu?"** Kontrat kod kadar
emek istiyorsa (değişiklik yalnız Opus'un elindeki context'e sıkı bağlıysa) → inline.

**Model pinleme (her dispatch'te açıkça):** writer = Sonnet high · reviewer = **farklı**
Sonnet instance · controller = Opus · (production'da çok büyük/karmaşık üretim için
Opus subagent). *Model belirtilmezse pahalı controller modeli miras alınır — bu
ekonomiyi sessizce bozar.*

---

## 5. "Dikişleri pinle, içini serbest bırak" (D4)

Kontrat yalnız **birimler-arası** olanı kesin yazar: dosya adları, imzalar, veri
şekilleri, mevcut kodla entegrasyon, kabul kriterleri, doğrulama komutu. **Birim-içi**
uygulamayı subagent'a bırakır ("iç detay senin"). Böylece drift, ucuz ve kolay
yakalanan **iç tarafa** hapsolur; pahalı **dikişler** kilitli kalır. Mod kalınlığı
ayarlar: standart = yalnız arayüz pinle; production = arayüz + kilit davranışlar + test.

---

## 6. Anti-drift & compaction çapası (H + I)

Uzun session'lar, **ucuz bir yeniden-çapalama artefaktı yoksa** sapar. Bu artefakt =
**kalıcı task-listesi + plan/task dosyasının başındaki anchor header**. Her döngüde
küçük olanı yeniden oku. **Asıl mekanizma yapı, ton değil.**

**Anchor header** (writing-plans yazar, plan dosyasının en başında):

```
MODE: standard | production
ROUTING: brainstorm-gate → plan/contract → delegate-by-contract-cost → independent review → verify-before-done
ON RESUME/COMPACTION: re-invoke cost-oriented-agentic-workflow:using-cost-oriented-workflow, then trust this file + the ledger + git over memory.
```

Bu, sadece mod **etiketini** değil **davranışı** taşır: compaction sonrası dosya +
ledger (`<git-dir>/cow/progress.md`) + `git log` = yer gerçeği.

**HARD MUST listesi (asla yumuşatma — çapalar):**
- Kanıt olmadan "bitti" yok.
- Anlaşılmış plan/kontrat olmadan kod yok.
- Scope'u sessizce aşma yok (yüzeye çıkar).
- Geri-döndürülemez / dışa-dönük / güvenlik-hassas işte onay.
- Dönüş protokolü (subagent özet+dosya+doğrulama döner; kod gövdesi controller'a girmez).

**YARGI listesi (kalibre et, törenleştirme):** devret vs inline · kontrat kalınlığı ·
review derinliği · test yazılsın mı · brainstorming yoğunluğu · keşif genişliği.

---

## 7. Build aşaması: superpowers 6.0.0 → fork eşlemesi

**Yaklaşım:** Sıfırdan değil. superpowers'ın `subagent-driven-development`'ı zaten
Mimari-1 iskeletiydi (taze subagent/task, model seçimi, `task-brief`/`review-package`
dosya-handoff scriptleri, progress ledger, ayrı reviewer, status handling). Eksik
olan = bizim IP'miz (mod, kontrat-maliyeti, kalibrasyon, worktree-zorunluluğunu
kaldırma, %1-MUST yerine yargı). Bu yüzden **seçici fork + refactor**, Claude-Code-only
(diğer harness scaffold'ları — .codex/.cursor/.kimi/.pi/.opencode/gemini, evals — alınmadı).

| superpowers skill | Karar | Bizdeki karşılık |
|---|---|---|
| `using-superpowers` | **SAHİPLEN/yeniden yaz** | `using-cost-oriented-workflow` (entry/policy; %1-MUST yok, hard-vs-yargı çizgisi) |
| `subagent-driven-development` (+scriptler, prompt şablonları) | **SAHİPLEN/refactor** | `execution-routing` (kontrat-maliyeti, model pinleme, return protokolü, retry-2) |
| `requesting-code-review` (+code-reviewer.md) | **SAHİPLEN/refactor** | `requesting-review` (bağımsız Sonnet reviewer + Opus dikiş; production güvenlik-lensi) |
| `brainstorming` (+görsel sunucu) | **SAHİPLEN/refactor (lite)** | `brainstorming` (görsel-companion sunucusu **atıldı**, kapı ölçekli, zorunlu spec-doc yok) |
| `writing-plans` | **SAHİPLEN/refactor** | `writing-plans` (anchor header + compaction çapası, `### Task N:` formatı) |
| `verification-before-completion` | **KORU (yakın-upstream)** | aynı (melodram kırpıldı) |
| `dispatching-parallel-agents` | **KORU + D7/D9** | katı non-overlapping dosya-sahipliği + standartta worktree yok |
| `test-driven-development` | **KORU, production-gated** | özlü, production/istek üzerine |
| `using-git-worktrees` | **KORU, demote** | yalnız production/ayrıştırılamayan paralel |
| `executing-plans` | **ATILDI** | same-session Arch-1 var, gereksiz |
| `finishing-a-development-branch` | **ATILDI (v1)** | standartta branch/worktree seremonisi yok |
| `receiving-code-review` | **ATILDI/fold** | execution-routing'in review döngüsüne gömülü |
| `systematic-debugging` | **OPSİYONEL** | v1'e alınmadı |
| `writing-skills` | **SHIP EDİLMEDİ** | build sırasında format otoritesi olarak kullanıldı |

**Yeni (bizim IP):** `preparing-subagent-prompts` — SDD'nin "File Handoffs" +
"Constructing Reviewer Prompts" disiplinini özlü standalone'a çıkardık.

**Build adımları (yapıldığı sıra):** (0) format teyidi `writing-skills`'ten →
(1) iskelet: `plugin.json`+`marketplace.json`, dizinler, `DECISIONS.md→docs/`,
`git init` → (2) entry skill → (3) execution-routing + scriptler + 2 şablon →
**[CHECKPOINT: kullanıcı kalbi onayladı]** → (4) brainstorming-lite + writing-plans →
(5) requesting-review + preparing-subagent-prompts → (6) yakın-upstream kopyalar →
(7) commands + opsiyonel hooks → (8) statik doğrulama + README/LICENSE/memory.

---

## 8. Çıktı: nihai yapı ve her skill'in rolü

```
cost-oriented-agentic-workflow/
  .claude-plugin/{plugin.json, marketplace.json}   # name=cost-oriented-agentic-workflow v0.1.0
  commands/{cost-oriented-agentic-workflow.md, production.md}
  hooks/{session-start, run-hook.cmd, hooks.json.example, README.md}  # opt-in, default kapalı
  skills/
    using-cost-oriented-workflow/SKILL.md          # KALP: entry/policy
    execution-routing/                             # KALP: inline-vs-devret + loop
      SKILL.md, implementer-prompt.md, task-reviewer-prompt.md
      scripts/{task-brief, review-package}
    writing-plans/SKILL.md
    brainstorming/SKILL.md
    requesting-review/{SKILL.md, code-reviewer.md}
    preparing-subagent-prompts/SKILL.md
    verification-before-completion/SKILL.md
    dispatching-parallel-agents/SKILL.md
    test-driven-development/SKILL.md                # production-gated
    using-git-worktrees/SKILL.md                    # production-gated
  docs/{DECISIONS.md, HANDOFF.md}
  README.md, LICENSE (MIT + superpowers atfı), .gitignore
```

**11 skill, rolleri:**
- **using-cost-oriented-workflow** — entry/policy hub: çekirdek ekonomi, modlar, akış
  flowchart'ı, HARD vs YARGI listeleri, anti-drift/anchor, token-ekonomi duruşu,
  instruction-priority, "nereye git" yönlendirmesi.
- **execution-routing** — kontrat-maliyeti routing kapısı (flowchart), model pinleme,
  dikişleri-pinle, devret döngüsü (flowchart), dönüş protokolü, status handling, retry-2,
  batch/paralel, progress ledger. Yan dosyalar: implementer & task-reviewer prompt
  şablonları; `task-brief`/`review-package` scriptleri (bulk'u dosyaya taşır,
  controller'ı ince tutar; çalışma dizini `<git-dir>/cow/`).
- **writing-plans** — plan/task dosyası + **anchor header** + `### Task N:` (task-brief
  ile uyumlu) + pinlenmiş arayüzler (Consumes/Produces) + Global Constraints + self-review.
- **brainstorming** — kapı ölçekli (net istek→1-3 cümle; dağınık→sorular+2-3 yaklaşım);
  standartta inline tasarım+onay, production'da spec-doc; terminal → writing-plans.
- **requesting-review** — bağımsız reviewer (yazandan farklı instance), moda göre derinlik;
  per-task (task-reviewer-prompt) vs whole-work (code-reviewer.md); production güvenlik-lensi.
- **preparing-subagent-prompts** — tek-task dispatch, bulk'u dosya olarak ver, exact
  değerleri pinle, modeli belirt, reviewer'ı pre-judge etme.
- **verification-before-completion** — kanıt-önce-iddia; Iron Law + gate + red flags.
- **dispatching-parallel-agents** — bağımsız öbekler paralel; **katı dosya-sahipliği**;
  worktree yalnız production/ayrıştırılamaz.
- **test-driven-development** — production-gated RED-GREEN-REFACTOR.
- **using-git-worktrees** — production/ayrıştırılamayan paralel izolasyon.

**Komutlar:** `/cost-oriented-agentic-workflow [görev]` (standart) ·
`/cost-oriented-agentic-workflow:production [görev]` (production). İkisi de entry
skill'i çağırır ve session boyunca o modu kurar; modu anchor header'a yazar.

**Önemli not (çakışma):** Skill adlarımızın 6'sı superpowers ile birebir aynı
(brainstorming, writing-plans, verification-before-completion, dispatching-parallel-agents,
test-driven-development, using-git-worktrees). İkisi de açıkken referanslar
`cost-oriented-agentic-workflow:<ad>` ile **qualify** edilmeli; entry skill ve iki
terminal handoff bu şekilde düzeltildi.

---

## 9. Aktivasyon / kurulum / kullanım

**Aktivasyon felsefesi (A2/I):** default = **launcher komutu** (her session'ı zorla
workflow'a sokmaz). İsteyen **opsiyonel SessionStart hook** ile her-session açabilir
(`hooks/hooks.json.example` → `hooks.json` olarak kopyala + plugin'i yeniden enable et;
bash + `run-hook.cmd` Windows shim; `startup|clear|compact` matcher'ı compaction
re-anchor'ı da besler).

**Kurulum (yerel, interaktif — Claude tetikleyemez, kullanıcı çalıştırır):**
```
/plugin marketplace add C:\Users\gencberke\Desktop\cost-oriented-agentic-workflow
/plugin install cost-oriented-agentic-workflow
```

---

## 10. Yapılan doğrulama & güncel durum

**Statik doğrulama (TAMAM, temiz):**
- 3 JSON dosyası geçerli (`plugin.json`, `marketplace.json`, `hooks.json.example`).
- 3 bash dosyası `bash -n` temiz; scriptler+hook executable (chmod +x).
- 10 SKILL.md frontmatter geçerli: `name`+`description` var, frontmatter ≤274 char
  (limit 1024), hepsinde **name == dizin adı**.
- Qualified cross-ref çözülüyor; bilinen relative `.md` linkleri mevcut.

**Durum:** İnşa + statik doğrulama tamam. **Davranışsal dogfood bekliyor** —
interaktif `/plugin install` gerektiği için Claude tetikleyemez; kullanıcının adımı.
**Henüz git commit yok** (repo init'li, her şey untracked; commit kullanıcı onayına
bırakıldı — imza/AI-mention eklenmeyecek).

---

## 11. Açık işler / sıradaki adımlar

1. **Kurulum + dogfood:** Temiz throwaway klasörde küçük gerçek görev (örn. "~2 dosya/
   80+ satır util modülü + testleri" — **devretmeyi** tetikler). Gözlenecek: brainstorming
   kapısı · anchor header (MOD) yazımı · iş **Sonnet'e devrediliyor mu** + model pinleniyor mu ·
   **bağımsız reviewer** dönüyor + Opus yalnız dikiş · kanıtsız "bitti" yok.
2. **Eşik kalibrasyonu:** devret/inline eşiği (~60/~80-100 satır) gerçek davranışla ayarlanacak.
3. **İlk commit** (kullanıcı isterse; `gencberke` olarak, AI imzası olmadan).
4. **Olası v2:** `systematic-debugging`/`finishing-a-development-branch` geri eklemek;
   `G3` "yeterince iyi, dur" bütçe eşiği (şimdilik kapsam dışı); superpowers'tan manuel sync.

---

## 12. Provenans

`superpowers` (Jesse Vincent, MIT) 6.0.0'dan türetildi; bu fork upstream 6.0.0'ı izler
ve **manuel sync** edilir. Lisans: MIT (bkz. `LICENSE`, superpowers atfıyla). Tam tasarım
gerekçesi ve karar geçmişi: `docs/DECISIONS.md`.
