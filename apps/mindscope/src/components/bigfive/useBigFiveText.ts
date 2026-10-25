import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { B5_DOMAINS, type B5Domain } from '@mindscope/core';
import { bigFiveTexts, pick, type BigFiveDomainText } from '@mindscope/banks';

/** Localized Big Five domain and facet texts. */
export function useBigFiveText() {
  const { locale } = useI18n();
  const domainText = (d: B5Domain) => pick(bigFiveTexts.domains[d], locale.value) as BigFiveDomainText;
  const names = computed(() => Object.fromEntries(B5_DOMAINS.map((d) => [d, domainText(d).name])) as Record<B5Domain, string>);
  const facetName = (f: string) => pick(bigFiveTexts.facets[f], locale.value) ?? f;
  return { domainText, names, facetName };
}
