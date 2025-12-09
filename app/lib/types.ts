export interface FECEntry {
  JournalCode: string;
  JournalLib: string;
  EcritureNum: string; // Clé pour grouper les écritures
  EcritureDate: string;
  CompteNum: string; // Clé pour le mapping
  CompteLib: string;
  CompAuxNum: string;
  CompAuxLib: string;
  PieceRef: string;
  PieceDate: string;
  EcritureLib: string;
  Debit: number | string; // À parser en float
  Credit: number | string; // À parser en float
  EcritureLet: string;
  DateLet: string;
  ValidDate: string;
  Montantdevise: number;
  Idevise: string;
}

export interface MappingRule {
  account: string; // Ex: "6135200003"
  concept: string; // Ex: "Software licences G&A"
  grandeCategorie: string; // Ex: "Operating Expenses (OPEX)"
  sousCategorie: string; // Ex: "R&D Expenses"
}

export interface MonthlyAmounts {
  [monthKey: string]: number; // Format: "2025-01", "2025-02", etc.
}

export interface AccountDetail {
  compteNum: string;
  compteLib: string;
  netAmount: number;
  monthlyAmounts?: MonthlyAmounts;
  monthlyBudgets?: MonthlyAmounts; // Montants budgétés par mois (mockés)
}

export interface OperatingModelRow {
  id: string; // Unique ID
  type: 'category' | 'subcategory' | 'concept';
  category: string; // Grande Catégorie
  subCategory?: string; // Sous-Catégorie (si type = subcategory ou concept)
  concept?: string; // Concept (si type = concept)
  amount: number; // ∑(Debit - Credit) - total
  monthlyAmounts?: MonthlyAmounts; // Montants par mois (pour concept)
  monthlyBudgets?: MonthlyAmounts; // Montants budgétés par mois
  isCollapsed?: boolean; // Pour les catégories et sous-catégories
  children?: OperatingModelRow[]; // Enfants (sous-catégories ou concepts)
  accountNumbers?: string[]; // Numéros de compte associés à cette ligne
  accountDetails?: AccountDetail[]; // Détails des comptes pour les sous-catégories
}

