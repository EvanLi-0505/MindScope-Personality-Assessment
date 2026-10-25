import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { useAppStore } from './stores/app';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
  { path: '/onboarding', name: 'onboarding', component: () => import('./pages/OnboardingPage.vue'), meta: { bare: true } },
  { path: '/profiles', name: 'profiles', component: () => import('./pages/ProfilesPage.vue') },
  { path: '/profiles/new', name: 'profile-new', component: () => import('./pages/ProfileEditPage.vue') },
  { path: '/profiles/:id', name: 'profile-detail', component: () => import('./pages/ProfileDetailPage.vue'), props: true },
  { path: '/profiles/:id/edit', name: 'profile-edit', component: () => import('./pages/ProfileEditPage.vue'), props: true },
  { path: '/compare', name: 'compare', component: () => import('./pages/ComparePage.vue') },
  { path: '/assess', name: 'assess', component: () => import('./pages/AssessPage.vue') },
  { path: '/test/:id', name: 'test', component: () => import('./pages/TestPage.vue'), props: true, meta: { focus: true } },
  { path: '/results/:id', name: 'result', component: () => import('./pages/ResultPage.vue'), props: true },
  { path: '/b5/:id', name: 'bigfive-result', component: () => import('./pages/BigFiveResultPage.vue'), props: true },
  { path: '/check/:id', name: 'check', component: () => import('./pages/CheckPage.vue'), props: true, meta: { focus: true } },
  { path: '/wellbeing/:id', name: 'check-result', component: () => import('./pages/CheckResultPage.vue'), props: true },
  { path: '/report/:kind/:id', name: 'report', component: () => import('./pages/ReportPage.vue'), props: true, meta: { bare: true } },
  { path: '/history', name: 'history', component: () => import('./pages/HistoryPage.vue') },
  { path: '/bank', name: 'bank', component: () => import('./pages/PlaceholderPage.vue'), props: { section: 'bank' } },
  { path: '/data', name: 'data', component: () => import('./pages/DataPage.vue') },
  { path: '/ai', name: 'ai', component: () => import('./pages/AiSettingsPage.vue') },
  { path: '/settings', name: 'settings', component: () => import('./pages/SettingsPage.vue') },
  { path: '/more', name: 'more', component: () => import('./pages/MorePage.vue') },
  { path: '/diagnostics/pdf', name: 'pdf-test', component: () => import('./pages/PdfTestPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

// Hash history: works from file-like origins (Tauri, static hosting) without server rewrites.
export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

/**
 * A failed navigation usually means storage disappeared under the running app
 * (e.g. browser data was cleared in another window). Show it instead of
 * leaving the user on a page that silently stops reacting.
 */
router.onError((err) => {
  const app = useAppStore();
  const message = err instanceof Error ? err.message : String(err);
  app.platform?.log('error', `navigation failed: ${message}`);
  app.boot = { status: 'error', code: 'unknown', message };
});

/** First run: no person card yet → onboarding. */
router.beforeEach(async (to) => {
  const app = useAppStore();
  if (app.boot.status !== 'ready') return true;
  if (to.name === 'onboarding' || to.name === 'pdf-test') return true;
  const count = await app.r().profiles.count();
  if (count === 0) return { name: 'onboarding' };
  return true;
});
