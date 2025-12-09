import { MAPPING_RULES } from './mapping';

/**
 * Extrait toutes les grandes catégories uniques du mapping
 */
export function getGrandesCategories(): string[] {
  const categories = new Set<string>();
  MAPPING_RULES.forEach((rule) => {
    categories.add(rule.grandeCategorie);
  });
  return Array.from(categories).sort();
}

/**
 * Extrait toutes les sous-catégories pour une grande catégorie donnée
 */
export function getSousCategories(grandeCategorie: string): string[] {
  const sousCategories = new Set<string>();
  MAPPING_RULES.forEach((rule) => {
    if (rule.grandeCategorie === grandeCategorie) {
      sousCategories.add(rule.sousCategorie);
    }
  });
  return Array.from(sousCategories).sort();
}

/**
 * Extrait tous les concepts uniques pour une grande catégorie et sous-catégorie données
 */
export function getConcepts(grandeCategorie: string, sousCategorie: string): string[] {
  const concepts = new Set<string>();
  MAPPING_RULES.forEach((rule) => {
    if (rule.grandeCategorie === grandeCategorie && rule.sousCategorie === sousCategorie) {
      concepts.add(rule.concept);
    }
  });
  return Array.from(concepts).sort();
}

