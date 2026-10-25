/**
 * Prompts for the optional AI features. Pure functions: the app gathers
 * stored results, this module turns them into the exact messages that will be
 * shown to the user for approval and then sent.
 *
 * Privacy by construction: the input types have no field for a name, notes,
 * avatar or per-item answers, so those can never end up in a request.
 */
import { DIMENSIONS, FIRST_POLE, FUNCTIONS, SECOND_POLE, type CogFunction, type Dimension, type ModeId } from '../bank/types';
import type { MbtiResult } from '../scoring/mbti';

export const AI_PROMPT_VERSION = 'ai-prompt@1';

export type AiTaskId = 'history' | 'growth' | 'advice';
export type AiCategory = 'personality' | 'demographics' | 'wellbeing' | 'growth';
export type AiLocale = 'zh-CN' | 'en';

/** Which data each task needs, and which the user may add. */
export const TASK_CATEGORIES: Record<AiTaskId, { required: AiCategory[]; optional: AiCategory[] }> = {
  history: { required: ['personality'], optional: ['demographics', 'wellbeing', 'growth'] },
  growth: { required: ['growth'], optional: ['personality', 'demographics', 'wellbeing'] },
  advice: { required: ['personality'], optional: ['demographics', 'growth'] },
};

export const MAX_GROWTH_NOTES = 20;
export const MAX_GROWTH_NOTE_CHARS = 500;
export const MAX_PERSONALITY_POINTS = 12;

export interface AiPersonalityPoint {
  /** YYYY-MM-DD */
  date: string;
  mode: ModeId;
  typeCode: string;
  answered: number;
  planned: number;
  /** Per dimension: leaning letter, strength in percent (50–100) and standard error in percent. */
  dimensions: Record<Dimension, { leaning: string | null; strength: number | null; se: number | null }>;
  /** 0–100 or null when too few answers. */
  functions: Record<CogFunction, number | null>;
}

export interface AiWellbeingPoint {
  date: string;
  /** e.g. "PHQ-9" */
  scale: string;
  score: number;
  maxScore: number;
  band: string;
  higherIsBetter: boolean;
  /** A safety item (PHQ-9 item 9) was answered above zero. */
  safety: boolean;
}

export interface AiGrowthNote {
  date: string;
  text: string;
}

export interface AiDemographics {
  /** e.g. "25–29" — never the exact birth year. */
  ageRange?: string;
  gender?: string;
  occupation?: string;
}

export interface AiInput {
  task: AiTaskId;
  locale: AiLocale;
  /** Oldest first. */
  personality?: AiPersonalityPoint[];
  demographics?: AiDemographics;
  wellbeing?: AiWellbeingPoint[];
  growth?: AiGrowthNote[];
}

export interface AiMessage {
  role: 'system' | 'user';
  content: string;
}

export interface AiRequestPlan {
  messages: AiMessage[];
  categories: AiCategory[];
  /** App-generated description of the data used (shown next to the AI text). */
  basis: string[];
  /** Crisis resources must be shown with the answer. */
  safety: boolean;
  /** The task cannot run (e.g. no growth notes for a growth summary). */
  missing: AiCategory[];
}

const isoDate = (iso: string) => iso.slice(0, 10);

/** Converts a stored result into the minimal form sent to a provider. */
export function toPersonalityPoint(r: MbtiResult, createdAt: string, mode: ModeId, planned: number): AiPersonalityPoint {
  const dimensions = Object.fromEntries(
    DIMENSIONS.map((d) => {
      const s = r.dimensions[d];
      if (s.score == null) return [d, { leaning: null, strength: null, se: null }];
      const leaning = s.score > 0 ? FIRST_POLE[d] : s.score < 0 ? SECOND_POLE[d] : null;
      return [d, { leaning, strength: Math.round(50 + Math.abs(s.score) * 50), se: s.se == null ? null : Math.round(s.se * 50) }];
    }),
  ) as AiPersonalityPoint['dimensions'];
  const functions = Object.fromEntries(FUNCTIONS.map((f) => [f, r.functions[f].score == null ? null : Math.round(r.functions[f].score!)])) as Record<
    CogFunction,
    number | null
  >;
  return { date: isoDate(createdAt), mode, typeCode: r.typeCode, answered: r.answered, planned, dimensions, functions };
}

/** 5-year bands so the exact age is not sent. */
export function ageRange(birthYear: number | null | undefined, now = new Date()): string | undefined {
  if (!birthYear) return undefined;
  const age = now.getFullYear() - birthYear;
  if (age < 0 || age > 120) return undefined;
  const lo = Math.floor(age / 5) * 5;
  return `${lo}–${lo + 4}`;
}

// ── texts ───────────────────────────────────────────────────────────────

const T = {
  'zh-CN': {
    system: [
      '你是一位帮助普通人理解自我评估结果的写作助手，具备心理学常识，语气温和、具体、不说教。',
      '你收到的是一款开源软件 MindScope 中由用户自愿提供的数据：16 型人格偏好的自评结果（非官方 MBTI，题库尚未经过常模验证），以及可能附带的心理状态自评分数和用户自己写的成长记录。',
      '必须遵守：',
      '1. 只根据提供的数据说话，不编造任何经历、事件或数据；需要推测时明确写"可能""也许"。',
      '2. 不把同时出现的现象说成因果关系。',
      '3. 不预测人格将来会如何变化，不给人格类型打好坏分。',
      '4. 不做任何诊断，不用疾病名称下结论；人格类型与心理健康无关，不能用人格结果推断心理状态。',
      '5. 数据不足时（例如只有一次测评、快速模式题量少、某维度接近均衡或标准误较大）要明确说明局限。',
      '6. 不复述成长记录里的隐私细节，概括即可。',
      '7. 使用简体中文，Markdown 格式，只用二级/三级标题、列表和粗体，不使用链接、图片、表格和代码。全文不超过 900 字。',
      '8. 第一节标题为"分析依据"，用一两句话说明你用了哪些数据；最后一节标题为"局限与提醒"。',
    ],
    safety:
      '数据中显示这位用户最近有过伤害自己或"不如死掉"的念头。请在开头用温和的语气建议他尽快联系信任的人和专业人员，可拨打全国统一心理援助热线 12356，遇到紧急危险拨打 110 或 120。不要评估风险高低。',
    wellbeingRule: '心理状态自评分数只能作为"自我观察"的参考，用"自评分数提示……"的表达，不能说成诊断；分数较高时建议和专业人员聊一聊。',
    tasks: {
      history: '请总结这位用户多次人格测评中**稳定的部分**和**有变化的部分**，说明变化可能只是测量误差还是值得留意的趋势（参考模式、题数和标准误），并给出 2–3 条自我观察建议。只有一次测评时，说明无法判断变化，只做单次结果的解读。',
      growth: '请阅读这位用户的成长记录，归纳反复出现的主题和变化，给出 3–5 条温和、具体的反思问题或建议。不要评判，不要把记录内容和人格类型强行联系。',
      advice: '请根据最近一次人格测评结果，给出学习、工作、沟通和与人相处方面的个性化建议，每方面 2–3 条，具体、可执行，并说明对应的依据（哪个维度或功能）。',
    },
    dataIntro: '以下是这位用户（不提供姓名）自愿提供的数据，JSON 格式：',
    subject: '这位用户',
  },
  en: {
    system: [
      'You are a writing assistant who helps ordinary people understand their self-assessment results. You have a solid grounding in psychology; your tone is warm, specific and not preachy.',
      'The data comes from MindScope, an open-source app, and was provided voluntarily: self-reported 16-type personality preferences (not the official MBTI; the item bank has no norms yet), and possibly wellbeing self-check scores and the user\'s own growth notes.',
      'Rules:',
      '1. Use only the data provided. Never invent experiences, events or numbers; mark guesses with "may" or "perhaps".',
      '2. Do not present things that occur together as cause and effect.',
      '3. Do not predict how personality will change, and do not rank types as better or worse.',
      '4. Never diagnose or conclude with illness names. Personality type says nothing about mental health; never infer wellbeing from it.',
      '5. When data is thin (a single result, quick mode, a dimension close to balanced or with a large standard error), say so clearly.',
      '6. Do not repeat private details from the growth notes; summarise.',
      '7. Write in English using Markdown with level-2/3 headings, lists and bold only — no links, images, tables or code. At most 600 words.',
      '8. The first section is titled "Basis" (one or two sentences on the data used); the last is titled "Limitations".',
    ],
    safety:
      'The data shows this person recently had thoughts of self-harm or of being better off dead. Begin by gently encouraging them to reach out to someone they trust and to a professional, and to call local emergency services if in danger. Do not rate the risk.',
    wellbeingRule: 'Wellbeing scores are for self-observation only — phrase them as "the self-check score suggests…", never as a diagnosis; suggest talking to a professional when scores are high.',
    tasks: {
      history: 'Summarise what is **stable** and what **changed** across this person\'s personality results, say whether changes may be measurement noise or a trend worth noticing (consider mode, item count and standard error), and give 2–3 self-observation suggestions. With only one result, say change cannot be judged and interpret that single result.',
      growth: 'Read this person\'s growth notes, identify recurring themes and changes, and offer 3–5 gentle, concrete reflection questions or suggestions. Do not judge, and do not force links between the notes and personality type.',
      advice: 'Based on the most recent personality result, give personalised suggestions for learning, work, communication and relationships — 2–3 each, concrete and actionable — and name the basis (which dimension or function).',
    },
    dataIntro: 'Data provided voluntarily by this person (no name given), as JSON:',
    subject: 'this person',
  },
} as const;

const MODE_NAMES: Record<AiLocale, Record<ModeId, string>> = {
  'zh-CN': { quick: '快速', normal: '普通', senior: '资深', full: '全域' },
  en: { quick: 'quick', normal: 'normal', senior: 'senior', full: 'full' },
};

function span(dates: string[], locale: AiLocale) {
  if (!dates.length) return '';
  const sorted = [...dates].sort();
  const a = sorted[0]!;
  const b = sorted[sorted.length - 1]!;
  if (a === b) return a;
  return locale === 'zh-CN' ? `${a} 至 ${b}` : `${a} to ${b}`;
}

/** Lines describing the data used, written by the app (not the AI). */
export function describeBasis(input: AiInput, categories: AiCategory[]): string[] {
  const zh = input.locale === 'zh-CN';
  const lines: string[] = [];
  const p = categories.includes('personality') ? (input.personality ?? []) : [];
  if (p.length) {
    const counts = new Map<ModeId, number>();
    for (const x of p) counts.set(x.mode, (counts.get(x.mode) ?? 0) + 1);
    const modes = [...counts].map(([m, n]) => (zh ? `${MODE_NAMES['zh-CN'][m]} ${n} 次` : `${MODE_NAMES.en[m]} ×${n}`)).join(zh ? '、' : ', ');
    const dates = span(
      p.map((x) => x.date),
      input.locale,
    );
    lines.push(zh ? `${p.length} 次人格测评（${dates}；${modes}）` : `${p.length} personality result(s) (${dates}; ${modes})`);
    if (p.length === 1 && input.task === 'history') lines.push(zh ? '只有一次测评，无法判断变化' : 'Only one result, so change cannot be judged');
  }
  const w = categories.includes('wellbeing') ? (input.wellbeing ?? []) : [];
  if (w.length) {
    const scales = [...new Set(w.map((x) => x.scale))].join(zh ? '、' : ', ');
    lines.push(zh ? `${w.length} 次心理状态自评（${scales}）` : `${w.length} wellbeing self-check(s) (${scales})`);
  }
  const g = categories.includes('growth') ? (input.growth ?? []) : [];
  if (g.length) {
    lines.push(
      zh
        ? `${g.length} 条成长记录（${span(
            g.map((x) => x.date),
            input.locale,
          )}）`
        : `${g.length} growth note(s) (${span(
            g.map((x) => x.date),
            input.locale,
          )})`,
    );
  }
  if (categories.includes('demographics') && input.demographics) {
    const d = input.demographics;
    const parts = [d.ageRange && (zh ? '年龄段' : 'age range'), d.gender && (zh ? '性别' : 'gender'), d.occupation && (zh ? '职业' : 'occupation')].filter(
      Boolean,
    );
    if (parts.length) lines.push(parts.join(zh ? '、' : ', '));
  }
  return lines;
}

/**
 * Builds the exact messages for a task. `categories` is what the user chose
 * to share; required categories are always included, unknown ones ignored.
 */
export function buildAiRequest(input: AiInput, chosen: AiCategory[]): AiRequestPlan {
  const t = T[input.locale];
  const spec = TASK_CATEGORIES[input.task];
  const categories = [...new Set([...spec.required, ...chosen.filter((c) => spec.optional.includes(c))])];

  const personality = categories.includes('personality') ? (input.personality ?? []).slice(-MAX_PERSONALITY_POINTS) : [];
  const wellbeing = categories.includes('wellbeing') ? (input.wellbeing ?? []) : [];
  const growth = categories.includes('growth')
    ? (input.growth ?? [])
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, MAX_GROWTH_NOTES)
        .reverse()
        .map((n) => ({ date: n.date, text: n.text.trim().slice(0, MAX_GROWTH_NOTE_CHARS) }))
    : [];
  const demographics = categories.includes('demographics') ? pickDefined(input.demographics ?? {}) : undefined;

  const missing: AiCategory[] = [];
  if (categories.includes('personality') && spec.required.includes('personality') && !personality.length) missing.push('personality');
  if (spec.required.includes('growth') && !growth.length) missing.push('growth');

  const data: Record<string, unknown> = { subject: t.subject };
  if (personality.length) {
    data.personalityResults = personality.map((p) => ({
      date: p.date,
      mode: p.mode,
      items: `${p.answered}/${p.planned}`,
      type: p.typeCode,
      dimensions: Object.fromEntries(
        DIMENSIONS.map((d) => [`${FIRST_POLE[d]}/${SECOND_POLE[d]}`, p.dimensions[d].leaning ? { ...p.dimensions[d] } : 'balanced or insufficient']),
      ),
      functions0to100: p.functions,
    }));
  }
  if (demographics && Object.keys(demographics).length) data.about = demographics;
  if (wellbeing.length) data.wellbeingSelfChecks = wellbeing.map(({ safety, ...w }) => ({ ...w, ...(safety ? { selfHarmThoughtsReported: true } : {}) }));
  if (growth.length) data.growthNotes = growth;

  const safety = wellbeing.some((w) => w.safety);
  const system = [...t.system, ...(wellbeing.length ? [t.wellbeingRule] : []), ...(safety ? [t.safety] : [])].join('\n');
  const user = `${t.tasks[input.task]}\n\n${t.dataIntro}\n${JSON.stringify(data, null, 2)}`;
  const used = categories.filter((c) => (c === 'personality' ? personality.length : c === 'wellbeing' ? wellbeing.length : c === 'growth' ? growth.length : !!data.about));

  return {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    categories: used,
    basis: describeBasis({ ...input, personality, wellbeing, growth }, used),
    safety,
    missing,
  };
}

function pickDefined(d: AiDemographics): AiDemographics {
  const out: AiDemographics = {};
  if (d.ageRange) out.ageRange = d.ageRange;
  if (d.gender) out.gender = d.gender;
  if (d.occupation?.trim()) out.occupation = d.occupation.trim().slice(0, 80);
  return out;
}
