/**
 * One assessment session in the UI. Every answer, move and flag is written to
 * the database immediately, so closing the window never loses progress.
 * Question order comes from the adaptive planner in @mindscope/core; Big Five
 * sessions have their whole (fixed) question list from the start.
 */
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { nextEntry, scoreBigFive, scoreMbti, type B5FormId, type BankItem, type SequenceEntry } from '@mindscope/core';
import type { StoredBank, StoredBigFive, TestSession } from '@mindscope/storage';
import { useAppStore } from '../stores/app';

export type NextOutcome = 'moved' | 'review';

const TICK_MS = 500;
const PERSIST_EVERY_MS = 15_000;

export function useTestSession() {
  const app = useAppStore();

  const session = ref<TestSession | null>(null);
  const bank = shallowRef<StoredBank | null>(null);
  /** 'mbti' = 16-type (adaptive); 'bigfive' = Big Five preview (fixed form). */
  const kind = ref<'mbti' | 'bigfive'>('mbti');
  const bigFive = shallowRef<StoredBigFive | null>(null);
  const answers = ref<Record<string, number | null>>({});
  const index = ref(0);
  const busy = ref(false);
  const loadError = ref<'not_found' | 'done' | null>(null);

  // ── timing (counts only while the window is visible) ──
  const sessionUnsaved = ref(0);
  const savedElapsed = ref(0);
  const questionTotal = ref<Record<string, number>>({});
  const questionUnsaved: Record<string, number> = {};
  let lastTick = performance.now();
  let sincePersist = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const itemById = computed(() => new Map((bank.value?.items ?? []).map((i) => [i.id, i])));
  const sequence = computed<SequenceEntry[]>(() => session.value?.sequence ?? []);
  const total = computed(() => session.value?.plannedCount ?? 0);
  const current = computed(() => sequence.value[index.value] ?? null);
  const currentItem = computed<BankItem | null>(() => (current.value ? (itemById.value.get(current.value.itemId) ?? null) : null));
  const currentAnswer = computed(() => (current.value ? (answers.value[current.value.itemId] ?? null) : null));
  const answeredCount = computed(() => sequence.value.filter((e) => answers.value[e.itemId] != null).length);
  const isFrontier = computed(() => index.value === sequence.value.length - 1);
  const isLast = computed(() => isFrontier.value && sequence.value.length >= total.value);
  const flags = computed(() => new Set(session.value?.flags ?? []));
  const totalMs = computed(() => savedElapsed.value + sessionUnsaved.value);
  const currentMs = computed(() => (current.value ? (questionTotal.value[current.value.itemId] ?? 0) : 0));
  const points = computed(() => {
    const b = bank.value;
    const first = b?.items[0];
    return (first && b?.scales[first.scale]?.points) || 7;
  });

  function tick() {
    const now = performance.now();
    const delta = now - lastTick;
    lastTick = now;
    if (document.visibilityState !== 'visible' || !session.value || session.value.status !== 'in_progress') return;
    sessionUnsaved.value += delta;
    sincePersist += delta;
    const id = current.value?.itemId;
    if (id) {
      questionTotal.value[id] = (questionTotal.value[id] ?? 0) + delta;
      questionUnsaved[id] = (questionUnsaved[id] ?? 0) + delta;
    }
    if (sincePersist >= PERSIST_EVERY_MS) void persistTime();
  }

  async function persistTime() {
    const s = session.value;
    const ms = Math.round(sessionUnsaved.value);
    sincePersist = 0;
    if (!s || s.status !== 'in_progress' || ms <= 0) return;
    sessionUnsaved.value = 0;
    savedElapsed.value += ms;
    await app.r().sessions.addElapsed(s.id, ms);
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void persistTime();
    lastTick = performance.now();
  };

  async function load(id: string) {
    loadError.value = null;
    const s = await app.r().sessions.get(id);
    if (!s) {
      loadError.value = 'not_found';
      return;
    }
    if (s.status !== 'in_progress') {
      session.value = s;
      loadError.value = 'done';
      return;
    }
    if (app.r().bigfive.isBigFiveVersion(s.versionId)) {
      kind.value = 'bigfive';
      bigFive.value = await app.r().bigfive.load(s.versionId);
      bank.value = app.r().bigfive.asBank(bigFive.value, s.mode as B5FormId);
    } else {
      kind.value = 'mbti';
      bank.value = await app.r().bank.load(s.versionId);
    }
    const stored = await app.r().sessions.answers(id);
    answers.value = Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, v.value]));
    questionTotal.value = Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, v.timeMs]));
    session.value = s;
    savedElapsed.value = s.elapsedMs;
    index.value = Math.min(Math.max(s.cursor, 0), s.sequence.length - 1);
    lastTick = performance.now();
    if (!timer) timer = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', onVisibility);
  }

  async function answer(value: number) {
    const s = session.value;
    const e = current.value;
    if (!s || !e || busy.value) return;
    answers.value = { ...answers.value, [e.itemId]: value };
    const ms = questionUnsaved[e.itemId] ?? 0;
    questionUnsaved[e.itemId] = 0;
    await app.r().sessions.saveAnswer(s.id, e.itemId, value, ms);
  }

  /**
   * Where a move that is still being saved is heading. Quick presses chain
   * from there, so two fast "next" presses move two questions.
   */
  let pendingIndex: number | null = null;

  /**
   * Moves forward; draws the next question when standing on the newest one.
   * Skipping is allowed (like jumping in the progress grid); unanswered
   * questions are listed on the review page and counted when submitting.
   */
  async function next(): Promise<NextOutcome> {
    const s = session.value;
    if (!s || !bank.value || busy.value) return 'moved';
    const from = pendingIndex ?? index.value;
    if (from < sequence.value.length - 1) {
      // Save first, then show the next question: the page ignores key presses
      // until a move has finished, so the question must not change mid-move.
      const to = from + 1;
      pendingIndex = to;
      try {
        await app.r().sessions.setCursor(s.id, to);
        index.value = to;
      } finally {
        if (pendingIndex === to) pendingIndex = null;
      }
      return 'moved';
    }
    // A fixed form has every question already: the end of the list means review.
    if (kind.value === 'bigfive') return 'review';
    busy.value = true;
    try {
      const entry = nextEntry(bank.value, s.mode, s.seed, s.sequence, answers.value);
      if (!entry) return 'review';
      await app.r().sessions.appendEntry(s.id, entry, s.sequence.length);
      session.value = { ...s, sequence: [...s.sequence, entry], cursor: s.sequence.length };
      index.value = s.sequence.length;
      return 'moved';
    } finally {
      busy.value = false;
    }
  }

  async function prev() {
    if (!session.value || index.value === 0) return;
    index.value--;
    await app.r().sessions.setCursor(session.value.id, index.value);
  }

  async function jump(i: number) {
    if (!session.value || i < 0 || i >= sequence.value.length) return;
    index.value = i;
    await app.r().sessions.setCursor(session.value.id, i);
  }

  async function toggleFlag() {
    const s = session.value;
    const e = current.value;
    if (!s || !e) return;
    const next = flags.value.has(e.itemId) ? s.flags.filter((f) => f !== e.itemId) : [...s.flags, e.itemId];
    session.value = { ...s, flags: next };
    await app.r().sessions.setFlags(s.id, next);
  }

  /** Scores the answers and stores the result. Returns the new result id. */
  async function submit(): Promise<string> {
    const s = session.value!;
    const b = bank.value!;
    busy.value = true;
    try {
      await persistTime();
      if (kind.value === 'bigfive') {
        const form = s.mode as B5FormId;
        const result = scoreBigFive(bigFive.value!, form, answers.value);
        // A domain with too few answers has no score: ask for more answers instead of saving.
        if (Object.values(result.domains).some((d) => d.mean === null)) throw new Error('B5_INCOMPLETE');
        const resultId = await app.r().bigfive.complete(s.id, result, { versionId: s.versionId, form, elapsedMs: Math.round(savedElapsed.value) });
        session.value = { ...s, status: 'completed' };
        app.p().log('info', `big five completed (${form}, ${result.answered} items)`);
        return resultId;
      }
      const items = s.sequence.map((e) => itemById.value.get(e.itemId)).filter((i): i is BankItem => !!i);
      const result = scoreMbti(items, answers.value, b.scoring, points.value);
      const resultId = await app.r().sessions.complete(s.id, result, {
        mode: s.mode,
        plannedCount: s.plannedCount,
        bankVersionId: s.versionId,
        bankMaturity: b.status === 'published' ? 'published' : 'experimental',
        seed: s.seed,
        elapsedMs: Math.round(savedElapsed.value),
      });
      session.value = { ...s, status: 'completed' };
      app.p().log('info', `test completed (${s.mode}, ${items.length} items)`);
      return resultId;
    } finally {
      busy.value = false;
    }
  }

  /** Where a finished result of this session is shown. */
  const resultPath = (resultId: string) => (kind.value === 'bigfive' ? `/b5/${resultId}` : `/results/${resultId}`);

  function dispose() {
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibility);
  }

  onBeforeUnmount(() => {
    void persistTime();
    dispose();
  });

  return {
    session,
    bank,
    kind,
    resultPath,
    answers,
    index,
    busy,
    loadError,
    sequence,
    total,
    current,
    currentItem,
    currentAnswer,
    answeredCount,
    isFrontier,
    isLast,
    flags,
    totalMs,
    currentMs,
    points,
    itemById,
    load,
    answer,
    next,
    prev,
    jump,
    toggleFlag,
    submit,
    persistTime,
  };
}
