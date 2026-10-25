import { DIMENSIONS, FUNCTIONS, type BankFile, type BankItem, type Target } from '../src';

const LABELS = ['1', '2', '3', '4', '5', '6', '7'];

/** Synthetic bank: `perDim` items per dimension (half reverse keyed) and `perFunc` per function. */
export function makeBank(perDim = 30, perFunc = 12): BankFile {
  const items: BankItem[] = [];
  const add = (target: Target, n: number, reverseShare: number) => {
    const nReverse = Math.round(n * reverseShare);
    for (let i = 0; i < n; i++) {
      items.push({
        id: `${target}-${String(i + 1).padStart(3, '0')}`,
        target,
        key: i < nReverse ? -1 : 1,
        weight: 1,
        scale: 'likert7',
        text: { 'zh-CN': `${target} 测试题目 第${i + 1}题 内容${i * 7919}`, en: `${target} test item number ${i + 1} body ${i * 7919}` },
        enabled: true,
      });
    }
  };
  for (const d of DIMENSIONS) add(d, perDim, 0.5);
  for (const f of FUNCTIONS) add(f, perFunc, 0.25);
  return {
    instrument: 'ms16',
    version: '0.0.1',
    status: 'experimental',
    title: { 'zh-CN': '测试题库', en: 'Test bank' },
    license: 'CC-BY-SA-4.0',
    source: { 'zh-CN': '测试', en: 'test' },
    scales: { likert7: { points: 7, labels: { 'zh-CN': LABELS, en: LABELS } } },
    scoring: { engine: 'bipolar-likert@1', balancedThreshold: 0.1, bands: [0.1, 0.3, 0.6], minAnsweredRatio: 0.8, minFunctionItems: 2 },
    modes: {
      quick: { dimensions: { min: 4, max: 8, total: 24 }, functions: { per: 2 }, adaptive: true },
      normal: { dimensions: { min: 9, max: 15, total: 48 }, functions: { per: 4 }, adaptive: true },
      senior: { dimensions: { min: 16, max: 24, total: 80 }, functions: { per: 8 }, adaptive: true },
      full: { all: true, adaptive: false },
    },
    items,
  };
}
