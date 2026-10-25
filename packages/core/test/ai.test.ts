import { describe, expect, it } from 'vitest';
import {
  AI_PROMPT_VERSION,
  ageRange,
  buildAiRequest,
  scoreMbti,
  toPersonalityPoint,
  type AiInput,
  type AiPersonalityPoint,
} from '../src';
import { makeBank } from './fixtures';

const bank = makeBank();

/** A real scored result for a clear INTJ-style respondent. */
function point(date: string, mode: 'quick' | 'normal' = 'normal'): AiPersonalityPoint {
  const persona: Record<string, number> = { EI: -0.7, SN: -0.7, TF: 0.6, JP: 0.6, Ni: 0.8, Te: 0.6 };
  const items = bank.items.filter((i) => i.enabled).slice(0, 120);
  const answers = Object.fromEntries(items.map((i) => [i.id, Math.min(7, Math.max(1, Math.round(4 + 3 * i.key * (persona[i.target] ?? 0))))]));
  const r = scoreMbti(items, answers, bank.scoring, 7);
  return toPersonalityPoint(r, `${date}T10:00:00.000Z`, mode, items.length);
}

const base: AiInput = {
  task: 'history',
  locale: 'zh-CN',
  personality: [point('2026-01-05', 'quick'), point('2026-06-01')],
  demographics: { ageRange: '25–29', gender: '女', occupation: '设计师' },
  wellbeing: [{ date: '2026-06-02', scale: 'PHQ-9', score: 6, maxScore: 27, band: '轻度', higherIsBetter: false, safety: false }],
  growth: [{ date: '2026-05-01', text: '开始学吉他' }],
};

describe('AI request builder', () => {
  it('is versioned', () => {
    expect(AI_PROMPT_VERSION).toBe('ai-prompt@1');
  });

  it('sends only the required categories unless the user adds more', () => {
    const plan = buildAiRequest(base, []);
    expect(plan.categories).toEqual(['personality']);
    const user = plan.messages[1]!.content;
    expect(user).toContain('personalityResults');
    expect(user).not.toContain('设计师');
    expect(user).not.toContain('PHQ-9');
    expect(user).not.toContain('吉他');
  });

  it('adds optional categories the user chose, ignores ones the task does not allow', () => {
    const plan = buildAiRequest(base, ['demographics', 'wellbeing', 'growth']);
    expect(plan.categories.sort()).toEqual(['demographics', 'growth', 'personality', 'wellbeing']);
    expect(plan.messages[1]!.content).toContain('设计师');
    expect(plan.messages[0]!.content).toContain('自我观察');
    // advice does not allow wellbeing
    const advice = buildAiRequest({ ...base, task: 'advice' }, ['wellbeing']);
    expect(advice.categories).toEqual(['personality']);
    expect(advice.messages[1]!.content).not.toContain('PHQ-9');
  });

  it('has no way to carry a name, notes or item answers', () => {
    const sneaky = { ...base, name: '张三', note: '私密备注', answers: { 'EI-001': 7 } } as unknown as AiInput;
    const all = JSON.stringify(buildAiRequest(sneaky, ['demographics', 'wellbeing', 'growth']).messages);
    expect(all).not.toContain('张三');
    expect(all).not.toContain('私密备注');
    expect(all).not.toContain('EI-001');
  });

  it('adds the crisis instruction and flag when a safety item was answered', () => {
    const input = { ...base, wellbeing: [{ ...base.wellbeing![0]!, safety: true }] };
    const plan = buildAiRequest(input, ['wellbeing']);
    expect(plan.safety).toBe(true);
    expect(plan.messages[0]!.content).toContain('12356');
    expect(plan.messages[1]!.content).toContain('selfHarmThoughtsReported');
    // not shared → no flag, no instruction
    const without = buildAiRequest(input, []);
    expect(without.safety).toBe(false);
    expect(without.messages[0]!.content).not.toContain('12356');
  });

  it('writes the basis itself and notes when change cannot be judged', () => {
    expect(buildAiRequest(base, []).basis).toEqual(['2 次人格测评（2026-01-05 至 2026-06-01；快速 1 次、普通 1 次）']);
    const one = buildAiRequest({ ...base, personality: [point('2026-06-01')] }, []);
    expect(one.basis).toContain('只有一次测评，无法判断变化');
    const en = buildAiRequest({ ...base, locale: 'en' }, ['growth']);
    expect(en.basis).toEqual(['2 personality result(s) (2026-01-05 to 2026-06-01; quick ×1, normal ×1)', '1 growth note(s) (2026-05-01)']);
    expect(en.messages[0]!.content).toContain('Never diagnose');
  });

  it('reports missing data instead of sending an empty request', () => {
    expect(buildAiRequest({ ...base, task: 'growth', growth: [] }, []).missing).toEqual(['growth']);
    expect(buildAiRequest({ ...base, personality: [] }, []).missing).toEqual(['personality']);
  });

  it('limits growth notes to the 20 newest, 500 characters each', () => {
    const growth = Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, text: 'x'.repeat(800) }));
    const plan = buildAiRequest({ ...base, task: 'growth', growth }, []);
    const sent = JSON.parse(plan.messages[1]!.content.slice(plan.messages[1]!.content.indexOf('{'))) as { growthNotes: { date: string; text: string }[] };
    expect(sent.growthNotes).toHaveLength(20);
    expect(sent.growthNotes[0]!.date).toBe('2026-01-11');
    expect(sent.growthNotes.every((n) => n.text.length === 500)).toBe(true);
  });

  it('turns scores into leaning + strength and sends ages only as ranges', () => {
    const p = point('2026-06-01');
    expect(p.dimensions.EI.leaning).toBe('I');
    expect(p.dimensions.EI.strength).toBeGreaterThan(50);
    expect(ageRange(1998, new Date('2026-06-01'))).toBe('25–29');
    expect(ageRange(null)).toBeUndefined();
    expect(ageRange(2100, new Date('2026-06-01'))).toBeUndefined();
  });
});
