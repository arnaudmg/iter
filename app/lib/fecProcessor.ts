import _ from "lodash";
import {
  FECEntry,
  OperatingModelRow,
  MonthlyAmounts,
  AccountDetail,
} from "./types";
import { getMappingForAccount, getMappingWithFallback } from "./mapping";

/**
 * Normalise un numéro de compte en ajoutant des zéros à droite pour avoir 9 chiffres
 * Exemples:
 * - "613520003" → "613520003" (déjà 9 chiffres)
 * - "61352003" → "613520030" (ajoute un 0 à droite)
 * - "6135203" → "613520300" (ajoute deux 0 à droite)
 */
function normalizeAccountNumber(compteNum: string): string {
  const cleaned = String(compteNum || "").trim();
  if (!cleaned) return "";
  // Ajouter des zéros à droite jusqu'à avoir 9 chiffres
  return cleaned.padEnd(9, "0");
}

/**
 * Extrait le mois depuis une date au format YYYYMMDD
 * Exemple: "20250101" → "2025-01"
 */
function extractMonthKey(ecritureDate: string): string {
  const dateStr = String(ecritureDate || "").trim();
  if (dateStr.length >= 6) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    return `${year}-${month}`;
  }
  return "";
}

/**
 * Détermine si une catégorie nécessite des soldes cumulés (comptes de bilan)
 * vs des montants mensuels (comptes de résultat/P&L)
 */
function isBalanceSheetCategory(category: string): boolean {
  const balanceSheetCategories = [
    "Current Assets",
    "Current Liabilities",
    "Equity & Long-term Funding",
    "Non-Current Assets",
  ];
  return balanceSheetCategories.includes(category);
}

/**
 * Génère un montant budgété mocké basé sur le réel
 * Ajoute une variation aléatoire et arrondit pour faire "humain"
 */
function generateMockBudget(actualAmount: number): number {
  if (actualAmount === 0) return 0;
  
  // Variation entre -15% et +15%
  // On inverse parfois le sens pour simuler des sous/sur-consommations
  const variation = 1 + (Math.random() * 0.3 - 0.15);
  let budget = actualAmount * variation;

  // Arrondir pour faire "budget humain"
  const absVal = Math.abs(budget);
  if (absVal < 100) {
    budget = Math.round(budget / 10) * 10;
  } else if (absVal < 1000) {
    budget = Math.round(budget / 50) * 50;
  } else {
    budget = Math.round(budget / 100) * 100;
  }

  return budget;
}

/**
 * Calcule les soldes cumulés à partir des montants mensuels
 * Exemple: [100, 50, 30] → [100, 150, 180]
 */
function calculateCumulativeAmounts(
  monthlyAmounts: MonthlyAmounts
): MonthlyAmounts {
  const sortedMonths = Object.keys(monthlyAmounts).sort();
  const cumulative: MonthlyAmounts = {};
  let runningTotal = 0;

  sortedMonths.forEach((month) => {
    runningTotal += monthlyAmounts[month];
    cumulative[month] = runningTotal;
  });

  return cumulative;
}

/**
 * Valide que les écritures comptables sont équilibrées (débit = crédit pour chaque EcritureNum)
 * Retourne les écritures déséquilibrées pour affichage d'avertissements
 */
export function validateEcritures(entries: FECEntry[]): {
  isValid: boolean;
  unbalancedEcritures: Array<{
    ecritureNum: string;
    totalDebit: number;
    totalCredit: number;
    difference: number;
  }>;
} {
  const grouped = _.groupBy(entries, "EcritureNum");
  const unbalancedEcritures: Array<{
    ecritureNum: string;
    totalDebit: number;
    totalCredit: number;
    difference: number;
  }> = [];

  Object.entries(grouped).forEach(([ecritureNum, lines]) => {
    const totalDebit = lines.reduce((sum, line) => {
      const debit =
        typeof line.Debit === "string"
          ? parseFloat(line.Debit.replace(",", "."))
          : line.Debit || 0;
      return sum + debit;
    }, 0);

    const totalCredit = lines.reduce((sum, line) => {
      const credit =
        typeof line.Credit === "string"
          ? parseFloat(line.Credit.replace(",", "."))
          : line.Credit || 0;
      return sum + credit;
    }, 0);

    const difference = Math.abs(totalDebit - totalCredit);

    // Tolérance de 0.01 pour les erreurs d'arrondi
    if (difference > 0.01) {
      unbalancedEcritures.push({
        ecritureNum,
        totalDebit,
        totalCredit,
        difference,
      });
    }
  });

  return {
    isValid: unbalancedEcritures.length === 0,
    unbalancedEcritures,
  };
}

/**
 * Calcule le total global de toutes les écritures (mappées + non mappées)
 * En comptabilité, ce total doit être ≈ 0 (débit = crédit)
 */
export function calculateGlobalBalance(entries: FECEntry[]): {
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  isBalanced: boolean;
} {
  const totals = entries.reduce(
    (acc, entry) => {
      const debit =
        typeof entry.Debit === "string"
          ? parseFloat(entry.Debit.replace(",", "."))
          : entry.Debit || 0;
      const credit =
        typeof entry.Credit === "string"
          ? parseFloat(entry.Credit.replace(",", "."))
          : entry.Credit || 0;

      return {
        totalDebit: acc.totalDebit + debit,
        totalCredit: acc.totalCredit + credit,
      };
    },
    { totalDebit: 0, totalCredit: 0 }
  );

  const netBalance = totals.totalDebit - totals.totalCredit;
  // Tolérance de 0.01 pour les erreurs d'arrondi
  const isBalanced = Math.abs(netBalance) < 0.01;

  return {
    ...totals,
    netBalance,
    isBalanced,
  };
}

export function processRawFEC(
  entries: FECEntry[],
  customMappings?: Map<
    string,
    {
      concept: string;
      grandeCategorie: string;
      sousCategorie: string;
    }
  >
): OperatingModelRow[] {
  if (entries.length === 0) {
    return [];
  }

  // 1. Mapper chaque ligne du FEC
  const mappedEntries = entries
    .map((entry) => {
      // Nettoyer et normaliser le numéro de compte (ajouter des zéros à droite pour avoir 9 chiffres)
      const compteNum = normalizeAccountNumber(entry.CompteNum || "");

      // Vérifier d'abord les mappings personnalisés, puis les mappings de base
      let mapping = null;
      if (customMappings?.has(compteNum)) {
        const customMapping = customMappings.get(compteNum)!;
        mapping = {
          account: compteNum,
          concept: customMapping.concept,
          grandeCategorie: customMapping.grandeCategorie,
          sousCategorie: customMapping.sousCategorie,
        };
      } else {
        // La normalisation se passe ici car le fallback a déjà été tenté
        mapping = getMappingWithFallback(entry.CompteNum || "");
      }

      // Si toujours pas de mapping après le fallback, on normalise et on essaie une dernière fois.
      if (!mapping) {
        const normalizedCompteNum = normalizeAccountNumber(
          entry.CompteNum || ""
        );
        mapping = getMappingForAccount(normalizedCompteNum);
      }

      // Parser Debit et Credit en float si nécessaire
      const debit =
        typeof entry.Debit === "string"
          ? parseFloat(entry.Debit.replace(",", "."))
          : entry.Debit || 0;
      const credit =
        typeof entry.Credit === "string"
          ? parseFloat(entry.Credit.replace(",", "."))
          : entry.Credit || 0;
      const netAmount = debit - credit;

      return {
        ...entry,
        mapping,
        netAmount,
      };
    })
    .filter((e) => e.mapping !== null); // Garder uniquement les comptes mappés

  if (mappedEntries.length === 0) {
    // Aucun compte mappé trouvé
    return [];
  }

  // 2. Grouper par Grande Catégorie > Sous-Catégorie > Concept
  const grouped = _.groupBy(mappedEntries, (e) => e.mapping!.grandeCategorie);

  const result: OperatingModelRow[] = [];

  Object.entries(grouped).forEach(([category, categoryEntries]) => {
    // Grouper par sous-catégorie
    const subGrouped = _.groupBy(
      categoryEntries,
      (e) => e.mapping!.sousCategorie
    );

    const subCategoryRows: OperatingModelRow[] = [];
    let categoryTotal = 0;
    const categoryMonthlyAmounts: MonthlyAmounts = {};
    const categoryMonthlyBudgets: MonthlyAmounts = {};

    Object.entries(subGrouped).forEach(([subCategory, subEntries]) => {
      // Grouper par concept
      const conceptGrouped = _.groupBy(subEntries, (e) => e.mapping!.concept);

      const conceptRows: OperatingModelRow[] = [];
      let subCategoryTotal = 0;
      const subCategoryMonthlyAmounts: MonthlyAmounts = {};
      const subCategoryMonthlyBudgets: MonthlyAmounts = {};

      Object.entries(conceptGrouped).forEach(([concept, conceptEntries]) => {
        // Calculer le total et les montants mensuels pour le concept
        const conceptTotal = _.sumBy(conceptEntries, "netAmount");
        const conceptMonthlyAmounts: MonthlyAmounts = {};
        const conceptMonthlyBudgets: MonthlyAmounts = {};
        const conceptAccountNumbers = _.uniq(
          conceptEntries.map((e) => e.CompteNum)
        );
        const conceptAccountDetails: { [key: string]: AccountDetail } = {};

        // D'abord, on agrège les montants réels par compte et par mois
        conceptEntries.forEach((entry) => {
          const monthKey = extractMonthKey(entry.EcritureDate);
          const compteNum = entry.CompteNum;
          
          // Initialiser le compte si nécessaire
          if (!conceptAccountDetails[compteNum]) {
            conceptAccountDetails[compteNum] = {
              compteNum: compteNum,
              compteLib: entry.CompteLib,
              netAmount: 0,
              monthlyAmounts: {},
              monthlyBudgets: {},
            };
          }

          // Agréger le réel
          conceptAccountDetails[compteNum].netAmount += entry.netAmount;
          if (monthKey) {
             const currentAmount = conceptAccountDetails[compteNum].monthlyAmounts![monthKey] || 0;
             conceptAccountDetails[compteNum].monthlyAmounts![monthKey] = currentAmount + entry.netAmount;
          }
        });

        // Ensuite, on génère les budgets par compte/mois et on agrège le tout vers le concept
        Object.values(conceptAccountDetails).forEach(accountDetail => {
            if (accountDetail.monthlyAmounts) {
                Object.entries(accountDetail.monthlyAmounts).forEach(([month, amount]) => {
                    // Générer le budget pour ce compte/mois
                    // Utiliser une graine basée sur le compte+mois pour que ce soit stable si on recharge ? 
                    // Pour l'instant random simple suffira car c'est généré à l'import
                    const budgetAmount = generateMockBudget(amount);
                    
                    if (!accountDetail.monthlyBudgets) accountDetail.monthlyBudgets = {};
                    accountDetail.monthlyBudgets[month] = budgetAmount;

                    // Agréger vers Concept
                    conceptMonthlyAmounts[month] = (conceptMonthlyAmounts[month] || 0) + amount;
                    conceptMonthlyBudgets[month] = (conceptMonthlyBudgets[month] || 0) + budgetAmount;
                    
                    // Agréger vers Sous-Catégorie
                    subCategoryMonthlyAmounts[month] = (subCategoryMonthlyAmounts[month] || 0) + amount;
                    subCategoryMonthlyBudgets[month] = (subCategoryMonthlyBudgets[month] || 0) + budgetAmount;

                    // Agréger vers Catégorie
                    categoryMonthlyAmounts[month] = (categoryMonthlyAmounts[month] || 0) + amount;
                    categoryMonthlyBudgets[month] = (categoryMonthlyBudgets[month] || 0) + budgetAmount;
                });
            }
        });

        subCategoryTotal += conceptTotal;
        
        const finalAccountDetails = Object.values(conceptAccountDetails).sort(
          (a, b) => b.netAmount - a.netAmount
        );

        // Stocker les montants bruts au niveau concept (on cumulera plus tard si nécessaire)
        conceptRows.push({
          id: `${category}-${subCategory}-${concept}`,
          type: "concept",
          category: category,
          subCategory: subCategory,
          concept: concept,
          amount: conceptTotal,
          monthlyAmounts: conceptMonthlyAmounts, // Montants bruts pour l'instant
          monthlyBudgets: conceptMonthlyBudgets,
          accountNumbers: conceptAccountNumbers,
          accountDetails: finalAccountDetails, // Attacher les détails ici
          isCollapsed: true, // Les concepts seront collabables
        });
      });

      categoryTotal += subCategoryTotal;

      const subCategoryAccountNumbers = _.uniq(
        _.flatMap(conceptRows, "accountNumbers")
      );

      // Pour les comptes de bilan, calculer les soldes cumulés au niveau sous-catégorie
      const isBalanceSheet = isBalanceSheetCategory(category);
      
      const finalSubCategoryMonthlyAmounts = isBalanceSheet
        ? calculateCumulativeAmounts(subCategoryMonthlyAmounts)
        : subCategoryMonthlyAmounts;

      const finalSubCategoryMonthlyBudgets = isBalanceSheet
        ? calculateCumulativeAmounts(subCategoryMonthlyBudgets)
        : subCategoryMonthlyBudgets;

      // Mettre à jour les concepts avec les montants cumulés si nécessaire
      const updatedConceptRows = conceptRows.map((conceptRow) => ({
        ...conceptRow,
        monthlyAmounts: isBalanceSheet
          ? calculateCumulativeAmounts(conceptRow.monthlyAmounts || {})
          : conceptRow.monthlyAmounts,
        monthlyBudgets: isBalanceSheet
          ? calculateCumulativeAmounts(conceptRow.monthlyBudgets || {})
          : conceptRow.monthlyBudgets,
        accountDetails: conceptRow.accountDetails?.map(acc => ({
            ...acc,
            monthlyAmounts: isBalanceSheet 
                ? calculateCumulativeAmounts(acc.monthlyAmounts || {})
                : acc.monthlyAmounts,
            monthlyBudgets: isBalanceSheet
                ? calculateCumulativeAmounts(acc.monthlyBudgets || {})
                : acc.monthlyBudgets
        }))
      }));

      subCategoryRows.push({
        id: `${category}-${subCategory}`,
        type: "subcategory",
        category: category,
        subCategory: subCategory,
        amount: subCategoryTotal,
        monthlyAmounts: finalSubCategoryMonthlyAmounts,
        monthlyBudgets: finalSubCategoryMonthlyBudgets,
        isCollapsed: true, // Start collapsed
        children: updatedConceptRows,
        accountNumbers: subCategoryAccountNumbers,
      });
    });

    const categoryAccountNumbers = _.uniq(
      _.flatMap(subCategoryRows, "accountNumbers")
    );

    // Pour les comptes de bilan, calculer les soldes cumulés
    const finalCategoryMonthlyAmounts = isBalanceSheetCategory(category)
      ? calculateCumulativeAmounts(categoryMonthlyAmounts)
      : categoryMonthlyAmounts;

    const finalCategoryMonthlyBudgets = isBalanceSheetCategory(category)
        ? calculateCumulativeAmounts(categoryMonthlyBudgets)
        : categoryMonthlyBudgets;

    // Ajouter la ligne de catégorie
    result.push({
      id: category,
      type: "category",
      category: category,
      amount: categoryTotal,
      monthlyAmounts: finalCategoryMonthlyAmounts,
      monthlyBudgets: finalCategoryMonthlyBudgets,
      isCollapsed: false,
      children: subCategoryRows,
      accountNumbers: categoryAccountNumbers,
    });
  });

  // 3. Trier les catégories par ordre alphabétique
  return result.sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Extrait les entrées non mappées (comptes qui ne sont pas dans le mapping)
 */
export function getUnmappedEntries(entries: FECEntry[]): Array<{
  compteNum: string;
  compteLib: string;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
  count: number;
}> {
  const unmappedMap = new Map<
    string,
    {
      compteNum: string;
      compteLib: string;
      totalDebit: number;
      totalCredit: number;
      count: number;
    }
  >();

  entries.forEach((entry) => {
    const originalCompteNum = (entry.CompteNum || "").trim();
    let mapping = getMappingWithFallback(originalCompteNum);

    // Si toujours non mappé après le fallback, on normalise et on essaie une dernière fois.
    if (!mapping) {
      const normalizedCompteNum = normalizeAccountNumber(originalCompteNum);
      mapping = getMappingForAccount(normalizedCompteNum);

      if (!mapping) {
        const compteNumForAggregation =
          normalizedCompteNum || originalCompteNum;
        const debit =
          typeof entry.Debit === "string"
            ? parseFloat(entry.Debit.replace(",", "."))
            : entry.Debit || 0;
        const credit =
          typeof entry.Credit === "string"
            ? parseFloat(entry.Credit.replace(",", "."))
            : entry.Credit || 0;

        const existing = unmappedMap.get(compteNumForAggregation);
        if (existing) {
          existing.totalDebit += debit;
          existing.totalCredit += credit;
          existing.count += 1;
        } else {
          unmappedMap.set(compteNumForAggregation, {
            compteNum: compteNumForAggregation,
            compteLib: entry.CompteLib || "",
            totalDebit: debit,
            totalCredit: credit,
            count: 1,
          });
        }
      }
    }
  });

  // Convertir en tableau et calculer netAmount
  return Array.from(unmappedMap.values())
    .map((item) => ({
      ...item,
      netAmount: item.totalDebit - item.totalCredit,
    }))
    .sort((a, b) => {
      // Trier par montant net décroissant (en valeur absolue)
      return Math.abs(b.netAmount) - Math.abs(a.netAmount);
    });
}

/**
 * Retourne tous les comptes (mappés + non mappés) avec leurs informations
 * Utile pour la vue tableur où on veut voir tous les comptes ensemble
 */
export function getAllAccounts(entries: FECEntry[]): Array<{
  compteNum: string;
  compteLib: string;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
  count: number;
  isMapped: boolean;
  mapping?: {
    concept: string;
    grandeCategorie: string;
    sousCategorie: string;
  };
}> {
  const accountsMap = new Map<
    string,
    {
      compteNum: string;
      compteLib: string;
      totalDebit: number;
      totalCredit: number;
      count: number;
      mapping?: {
        concept: string;
        grandeCategorie: string;
        sousCategorie: string;
      };
    }
  >();

  entries.forEach((entry) => {
    const originalCompteNum = (entry.CompteNum || "").trim();
    let mapping = getMappingWithFallback(originalCompteNum);

    // Si toujours non mappé après le fallback, on normalise.
    const compteNumForAggregation =
      normalizeAccountNumber(originalCompteNum) || originalCompteNum;

    if (!mapping) {
      mapping = getMappingForAccount(compteNumForAggregation);
    }

    const debit =
      typeof entry.Debit === "string"
        ? parseFloat(entry.Debit.replace(",", "."))
        : entry.Debit || 0;
    const credit =
      typeof entry.Credit === "string"
        ? parseFloat(entry.Credit.replace(",", "."))
        : entry.Credit || 0;

    const existing = accountsMap.get(compteNumForAggregation);
    if (existing) {
      existing.totalDebit += debit;
      existing.totalCredit += credit;
      existing.count += 1;
    } else {
      accountsMap.set(compteNumForAggregation, {
        compteNum: compteNumForAggregation,
        compteLib: entry.CompteLib || "",
        totalDebit: debit,
        totalCredit: credit,
        count: 1,
        mapping: mapping
          ? {
              concept: mapping.concept,
              grandeCategorie: mapping.grandeCategorie,
              sousCategorie: mapping.sousCategorie,
            }
          : undefined,
      });
    }
  });

  // Convertir en tableau et calculer netAmount
  return Array.from(accountsMap.values())
    .map((item) => ({
      ...item,
      netAmount: item.totalDebit - item.totalCredit,
      isMapped: !!item.mapping,
    }))
    .sort((a, b) => {
      // Trier par numéro de compte pour faciliter la visualisation des comptes similaires
      return a.compteNum.localeCompare(b.compteNum);
    });
}
