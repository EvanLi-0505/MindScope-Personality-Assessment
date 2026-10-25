<script setup lang="ts">
/**
 * Automated desktop smoke test. Does nothing unless the exe was started with
 * MINDSCOPE_SMOKE_PDF=<path>. Then it: writes a demo person card, runs one
 * complete quick assessments and two PHQ-9 check-ins through the real
 * engines, then prints with WebView2: the person card to <path>, and the
 * formal reports to <path stem>-mbti.pdf, -phq9.pdf and -b5.pdf (Big Five).
 * With MINDSCOPE_SMOKE_AI=<local mock server>/v1 it also saves an encrypted
 * test key, runs one AI history analysis through the real Rust client and
 * prints it to <path stem>-ai.pdf.
 */
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  AI_PROMPT_VERSION,
  buildAiRequest,
  localize,
  nextEntry,
  nowIso,
  plannedCount,
  scoreBigFive,
  scoreMbti,
  scoreScale,
  toPersonalityPoint,
  type SequenceEntry,
} from '@mindscope/core';
import { AI_CONFIG_KEY, DEFAULT_AI_CONFIG } from '../ai/config';
import { useAppStore } from '../stores/app';

const app = useAppStore();
const router = useRouter();

/** Fixed respondent with clear E, S, F, P preferences. */
const PERSONA: Record<string, number> = { EI: 0.7, SN: 0.6, TF: -0.6, JP: -0.7, Se: 0.8, Fi: 0.6, Te: 0.1, Ni: -0.6 };

onMounted(async () => {
  const plat = app.p();
  if (!plat.smokeTarget) return;
  const target = await plat.smokeTarget();
  if (!target) return;
  try {
    plat.log('info', 'smoke: start');
    const r = app.r();
    const profile = await r.profiles.create({ name: 'Smoke 测试', isDemo: true, note: 'created by smoke test' });
    plat.log('info', `smoke: profiles=${await r.profiles.count()}`);

    const versionId = (await r.bank.latestVersionId('ms16'))!;
    const bank = await r.bank.load(versionId);

    /** One complete quick assessment through the real planner and scoring engine. */
    async function runOnce(persona: Record<string, number>, seed: number) {
      const answers: Record<string, number> = {};
      const seq: SequenceEntry[] = [nextEntry(bank, 'quick', seed, [], {})!];
      const session = await r.sessions.create({ profileId: profile.id, versionId, mode: 'quick', seed, plannedCount: plannedCount(bank, 'quick'), first: seq[0]! });
      for (;;) {
        const e = seq[seq.length - 1]!;
        const item = bank.items.find((i) => i.id === e.itemId)!;
        const v = Math.min(7, Math.max(1, Math.round(4 + 3 * item.key * (persona[item.target] ?? 0))));
        answers[e.itemId] = v;
        await r.sessions.saveAnswer(session.id, e.itemId, v, 1500);
        const next = nextEntry(bank, 'quick', seed, seq, answers);
        if (!next) break;
        await r.sessions.appendEntry(session.id, next, seq.length);
        seq.push(next);
      }
      const items = seq.map((e) => bank.items.find((i) => i.id === e.itemId)!);
      const result = scoreMbti(items, answers, bank.scoring, 7);
      return await r.sessions.complete(session.id, result, { mode: 'quick', plannedCount: seq.length, bankVersionId: versionId, bankMaturity: 'experimental', seed, elapsedMs: 60_000 });
    }

    await runOnce(PERSONA, 20261023);
    await new Promise((res) => setTimeout(res, 50)); // distinct timestamps
    const mbtiId = await runOnce({ ...PERSONA, TF: 0.5, JP: 0.4, Te: 0.7 }, 20261024); // later: T and J
    plat.log('info', `smoke: tests completed type=${(await r.results.get(mbtiId))?.typeCode}`);

    /** One PHQ-9 check-in; values in item order. */
    const phq = (await r.scales.latestVersions()).find((v) => v.instrument === 'phq9')!;
    const scale = await r.scales.load(phq.versionId);
    async function checkIn(values: number[]) {
      const sequence = scale.items.map((i) => ({ itemId: i.id, target: 'total' as const, reason: 'full' as const }));
      const s = await r.sessions.create({ profileId: profile.id, versionId: phq.versionId, mode: 'full', seed: 0, plannedCount: sequence.length, first: sequence[0]!, sequence });
      const answers: Record<string, number> = {};
      for (const [i, item] of scale.items.entries()) {
        answers[item.id] = values[i]!;
        await r.sessions.saveAnswer(s.id, item.id, values[i]!, 2000);
      }
      const result = scoreScale(scale, answers);
      plat.log('info', `smoke: phq9 score=${result.score} band=${result.band?.key} safety=${result.safetyItems.length}`);
      return r.scales.complete(s.id, result, { instrument: 'phq9', versionId: phq.versionId, elapsedMs: 90_000 });
    }
    await checkIn([2, 2, 2, 1, 1, 1, 1, 1, 0]);
    await new Promise((res) => setTimeout(res, 1100));
    const phqId = await checkIn([1, 1, 1, 0, 1, 0, 0, 1, 1]); // item 9 > 0: crisis card must print

    await r.growth.add(profile.id, '2026-10-01', '冒烟测试：开始每天散步。');

    // One Big Five (normal form, 50 items): high Openness, low Neuroticism, the rest in the middle.
    const b5Version = (await r.bigfive.latestVersionId())!;
    const b5 = await r.bigfive.load(b5Version);
    const b5Seq = b5.forms.normal.entries.map((e) => ({ itemId: e.item, target: e.domain, reason: 'full' as const }));
    const b5Session = await r.sessions.create({ profileId: profile.id, versionId: b5Version, mode: 'normal', seed: 0, plannedCount: b5Seq.length, first: b5Seq[0]!, sequence: b5Seq });
    const b5Answers: Record<string, number> = {};
    for (const e of b5.forms.normal.entries) {
      const trait = e.domain === 'O' ? 1 : e.domain === 'N' ? -1 : 0;
      const v = trait === 0 ? 3 : (trait > 0) === (e.key > 0) ? 5 : 1;
      b5Answers[e.item] = v;
      await r.sessions.saveAnswer(b5Session.id, e.item, v, 1200);
    }
    const b5Result = scoreBigFive(b5, 'normal', b5Answers);
    const b5Id = await r.bigfive.complete(b5Session.id, b5Result, { versionId: b5Version, form: 'normal', elapsedMs: 240_000 });
    plat.log('info', `smoke: big five O=${b5Result.domains.O.score100} N=${b5Result.domains.N.score100} E=${b5Result.domains.E.score100}`);

    // Optional AI round trip against a local mock server.
    const pages: [string, string][] = [];
    const stem = target.replace(/\.pdf$/i, '');
    const aiBase = (await plat.smokeAiBase?.()) ?? null;
    if (aiBase && plat.ai) {
      await r.settings.set(AI_CONFIG_KEY, { ...DEFAULT_AI_CONFIG, enabled: true, consentAt: nowIso(), provider: 'custom', baseUrl: aiBase, model: 'smoke-model' });
      const st = await plat.ai.saveKey('sk-smoke-0123456789-KEYX', true);
      plat.log('info', `smoke: ai key state=${st.state}`);
      const results = await r.results.list({ profileIds: [profile.id] });
      const wb = await r.scales.list({ profileIds: [profile.id] });
      const plan = buildAiRequest(
        {
          task: 'history',
          locale: 'zh-CN',
          personality: [...results].reverse().map((x) => toPersonalityPoint(x.result, x.createdAt, x.mode, x.meta.plannedCount)),
          wellbeing: [...wb].reverse().map((x) => ({
            date: x.createdAt.slice(0, 10),
            scale: localize(scale.shortName, 'zh-CN'),
            score: x.result.score ?? 0,
            maxScore: x.result.maxScore,
            band: x.result.band?.key ?? '',
            higherIsBetter: false,
            safety: x.result.safetyItems.length > 0,
          })),
        },
        ['wellbeing'],
      );
      const out = await plat.ai.chat({ requestId: 'smoke-1', messages: plan.messages, purpose: 'history', categories: plan.categories }, () => {});
      const note = await r.aiNotes.add({
        profileId: profile.id,
        task: 'history',
        model: out.model,
        promptVersion: AI_PROMPT_VERSION,
        categories: plan.categories,
        basis: { lines: plan.basis },
        safety: plan.safety,
        content: out.content,
      });
      const usage = await r.network.usage();
      plat.log('info', `smoke: ai ok chars=${out.content.length} tokens=${out.tokens} safety=${plan.safety} audit=${usage.requests}/${usage.lastOutcome}`);
      pages.push([`/report/ai/${note.id}`, `${stem}-ai.pdf`]);
    }

    for (const [route, path] of [
      [`/profiles/${profile.id}`, target],
      [`/report/mbti/${mbtiId}`, `${stem}-mbti.pdf`],
      [`/report/wellbeing/${phqId}`, `${stem}-phq9.pdf`],
      [`/report/bigfive/${b5Id}`, `${stem}-b5.pdf`],
      ...pages,
    ] as const) {
      await router.push(route);
      await new Promise((res) => setTimeout(res, 2500)); // let charts render
      await plat.printPdfTo!(path);
      plat.log('info', `smoke: pdf ok -> ${path}`);
    }

    // Backup → change → restore: the data must be back to the backup.
    const before = { profiles: await r.profiles.count(), results: (await r.results.list({})).length };
    const b = await plat.storage.backup('smoke');
    const extra = await r.profiles.create({ name: '恢复后应消失', isDemo: true });
    await r.growth.add(extra.id, '2026-10-24', 'x');
    await plat.storage.restore(b.name);
    const after = { profiles: await r.profiles.count(), results: (await r.results.list({})).length };
    const same = after.profiles === before.profiles && after.results === before.results && !(await r.profiles.get(extra.id));
    plat.log(same ? 'info' : 'error', `smoke: backup-restore ${same ? 'ok' : 'FAILED'} profiles=${before.profiles}->${after.profiles} results=${before.results}->${after.results} backup=${b.name}`);
  } catch (err) {
    plat.log('error', `smoke: failed ${String(err)}`);
  } finally {
    await new Promise((res) => setTimeout(res, 300));
    await plat.exit!();
  }
});
</script>

<template>
  <span hidden />
</template>
