"use client";

import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import {
  getGrandesCategories,
  getSousCategories,
  getConcepts,
} from "../lib/mappingHelpers";

interface AccountRow {
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
}

interface AccountsSpreadsheetModalProps {
  accounts: AccountRow[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    account: AccountRow,
    mapping: {
      concept: string;
      grandeCategorie: string;
      sousCategorie: string;
    }
  ) => void;
  onSaveAll?: (
    mappings: Array<{
      account: AccountRow;
      mapping: {
        concept: string;
        grandeCategorie: string;
        sousCategorie: string;
      };
    }>
  ) => void;
}

interface RowState {
  grandeCategorie: string;
  sousCategorie: string;
  concept: string;
  hasChanges: boolean;
}

export default function AccountsSpreadsheetModal({
  accounts,
  isOpen,
  onClose,
  onSave,
  onSaveAll,
}: AccountsSpreadsheetModalProps) {
  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());
  const [prefixFilter, setPrefixFilter] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<"compteNum" | "netAmount" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const grandesCategories = getGrandesCategories();

  // Initialiser les états des lignes (préserver les changements en cours)
  useEffect(() => {
    if (isOpen && accounts.length > 0) {
      setRowStates((prev) => {
        const newStates = new Map<string, RowState>();
        accounts.forEach((account) => {
          // Préserver l'état existant s'il existe et a des changements, sinon utiliser le mapping
          const existing = prev.get(account.compteNum);
          if (existing && existing.hasChanges) {
            newStates.set(account.compteNum, existing);
          } else {
            newStates.set(account.compteNum, {
              grandeCategorie: account.mapping?.grandeCategorie || "",
              sousCategorie: account.mapping?.sousCategorie || "",
              concept: account.mapping?.concept || "",
              hasChanges: false,
            });
          }
        });
        return newStates;
      });
    }
  }, [isOpen, accounts]);

  // Filtrer et trier les comptes
  const filteredAndSortedAccounts = useMemo(() => {
    let filtered = accounts;

    // Filtrer par préfixe
    if (prefixFilter) {
      filtered = filtered.filter((acc) =>
        acc.compteNum.startsWith(prefixFilter)
      );
    }

    // Trier
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let comparison = 0;
        if (sortColumn === "compteNum") {
          comparison = a.compteNum.localeCompare(b.compteNum);
        } else if (sortColumn === "netAmount") {
          comparison = Math.abs(a.netAmount) - Math.abs(b.netAmount);
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return filtered;
  }, [accounts, prefixFilter, sortColumn, sortDirection]);

  // Extraire les préfixes uniques pour le filtre
  const uniquePrefixes = useMemo(() => {
    const prefixes = new Set<string>();
    accounts.forEach((acc) => {
      // Extraire les 3 premiers digits comme préfixe
      const prefix = acc.compteNum.substring(0, 3);
      if (prefix) {
        prefixes.add(prefix);
      }
    });
    return Array.from(prefixes).sort();
  }, [accounts]);

  // Grouper les comptes par préfixe pour l'affichage
  const groupedByPrefix = useMemo(() => {
    const groups = new Map<string, AccountRow[]>();
    filteredAndSortedAccounts.forEach((account) => {
      const prefix = account.compteNum.substring(0, 3);
      if (!groups.has(prefix)) {
        groups.set(prefix, []);
      }
      groups.get(prefix)!.push(account);
    });
    return groups;
  }, [filteredAndSortedAccounts]);

  const handleGrandeCategorieChange = (
    compteNum: string,
    value: string
  ) => {
    setRowStates((prev) => {
      const newStates = new Map(prev);
      const current = newStates.get(compteNum) || {
        grandeCategorie: "",
        sousCategorie: "",
        concept: "",
        hasChanges: false,
      };
      const account = accounts.find((a) => a.compteNum === compteNum);
      const originalMapping = account?.mapping;

      newStates.set(compteNum, {
        grandeCategorie: value,
        sousCategorie: "",
        concept: "",
        hasChanges:
          value !== originalMapping?.grandeCategorie ||
          current.sousCategorie !== originalMapping?.sousCategorie ||
          current.concept !== originalMapping?.concept,
      });
      return newStates;
    });
  };

  const handleSousCategorieChange = (
    compteNum: string,
    value: string
  ) => {
    setRowStates((prev) => {
      const newStates = new Map(prev);
      const current = newStates.get(compteNum) || {
        grandeCategorie: "",
        sousCategorie: "",
        concept: "",
        hasChanges: false,
      };
      const account = accounts.find((a) => a.compteNum === compteNum);
      const originalMapping = account?.mapping;

      newStates.set(compteNum, {
        ...current,
        sousCategorie: value,
        concept: "",
        hasChanges:
          current.grandeCategorie !== originalMapping?.grandeCategorie ||
          value !== originalMapping?.sousCategorie ||
          current.concept !== originalMapping?.concept,
      });
      return newStates;
    });
  };

  const handleConceptChange = (compteNum: string, value: string) => {
    setRowStates((prev) => {
      const newStates = new Map(prev);
      const current = newStates.get(compteNum) || {
        grandeCategorie: "",
        sousCategorie: "",
        concept: "",
        hasChanges: false,
      };
      const account = accounts.find((a) => a.compteNum === compteNum);
      const originalMapping = account?.mapping;

      newStates.set(compteNum, {
        ...current,
        concept: value,
        hasChanges:
          current.grandeCategorie !== originalMapping?.grandeCategorie ||
          current.sousCategorie !== originalMapping?.sousCategorie ||
          value !== originalMapping?.concept,
      });
      return newStates;
    });
  };

  const handleSaveRow = (account: AccountRow) => {
    const state = rowStates.get(account.compteNum);
    if (
      state &&
      state.grandeCategorie &&
      state.sousCategorie &&
      state.concept
    ) {
      onSave(account, {
        grandeCategorie: state.grandeCategorie,
        sousCategorie: state.sousCategorie,
        concept: state.concept,
      });
      // Réinitialiser le flag de changement
      setRowStates((prev) => {
        const newStates = new Map(prev);
        const current = newStates.get(account.compteNum);
        if (current) {
          newStates.set(account.compteNum, {
            ...current,
            hasChanges: false,
          });
        }
        return newStates;
      });
    }
  };

  const handleSaveAll = () => {
    if (!onSaveAll) return;

    const mappingsToSave: Array<{
      account: AccountRow;
      mapping: {
        concept: string;
        grandeCategorie: string;
        sousCategorie: string;
      };
    }> = [];

    rowStates.forEach((state, compteNum) => {
      if (state.hasChanges && state.grandeCategorie && state.sousCategorie && state.concept) {
        const account = accounts.find((a) => a.compteNum === compteNum);
        if (account) {
          mappingsToSave.push({
            account,
            mapping: {
              grandeCategorie: state.grandeCategorie,
              sousCategorie: state.sousCategorie,
              concept: state.concept,
            },
          });
        }
      }
    });

    if (mappingsToSave.length > 0) {
      onSaveAll(mappingsToSave);
      // Réinitialiser les flags de changement
      setRowStates((prev) => {
        const newStates = new Map(prev);
        mappingsToSave.forEach(({ account }) => {
          const current = newStates.get(account.compteNum);
          if (current) {
            newStates.set(account.compteNum, {
              ...current,
              hasChanges: false,
            });
          }
        });
        return newStates;
      });
    }
  };

  const handleSort = (column: "compteNum" | "netAmount") => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSousCategoriesForRow = (grandeCategorie: string) => {
    return grandeCategorie ? getSousCategories(grandeCategorie) : [];
  };

  const getConceptsForRow = (
    grandeCategorie: string,
    sousCategorie: string
  ) => {
    return grandeCategorie && sousCategorie
      ? getConcepts(grandeCategorie, sousCategorie)
      : [];
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getAmountColor = (amount: number) => {
    if (amount > 0) return "text-red-600";
    if (amount < 0) return "text-green-600";
    return "text-gray-600";
  };

  const canSaveRow = (account: AccountRow) => {
    const state = rowStates.get(account.compteNum);
    return (
      state?.hasChanges &&
      state.grandeCategorie &&
      state.sousCategorie &&
      state.concept
    );
  };

  const hasChangesToSave = useMemo(() => {
    return Array.from(rowStates.values()).some((state) => state.hasChanges);
  }, [rowStates]);

  const mappedCount = accounts.filter((a) => a.isMapped).length;
  const unmappedCount = accounts.length - mappedCount;

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-[95vw] w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-light text-gray-900">
              Format tableur - Tous les comptes
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mappedCount} mappé(s) / {unmappedCount} non mappé(s)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filters and Controls */}
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex-shrink-0 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Filtrer par préfixe:
            </label>
            <select
              value={prefixFilter}
              onChange={(e) => setPrefixFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#562CFF] text-sm"
            >
              <option value="">Tous</option>
              {uniquePrefixes.map((prefix) => (
                <option key={prefix} value={prefix}>
                  {prefix}xx
                </option>
              ))}
            </select>
          </div>
          {onSaveAll && hasChangesToSave && (
            <button
              onClick={handleSaveAll}
              className="ml-auto px-4 py-2 bg-[#562CFF] text-white rounded-lg hover:bg-[#4521cc] transition-colors font-medium text-sm"
            >
              Sauvegarder tout
            </button>
          )}
        </div>

        {/* Table - Scrollable */}
        <div className="overflow-auto flex-1">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  <button
                    onClick={() => handleSort("compteNum")}
                    className="flex items-center gap-1 hover:text-gray-900"
                  >
                    Numéro
                    {sortColumn === "compteNum" && (
                      <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  Libellé
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  <button
                    onClick={() => handleSort("netAmount")}
                    className="flex items-center gap-1 hover:text-gray-900 ml-auto"
                  >
                    Montant net
                    {sortColumn === "netAmount" && (
                      <span>{sortDirection === "asc" ? "↑" : "↓"}</span>
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  Statut
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  Grande Catégorie
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  Sous-Catégorie
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  Concept
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedAccounts.map((account, index) => {
                const state = rowStates.get(account.compteNum) || {
                  grandeCategorie: account.mapping?.grandeCategorie || "",
                  sousCategorie: account.mapping?.sousCategorie || "",
                  concept: account.mapping?.concept || "",
                  hasChanges: false,
                };
                const sousCategories = getSousCategoriesForRow(
                  state.grandeCategorie
                );
                const concepts = getConceptsForRow(
                  state.grandeCategorie,
                  state.sousCategorie
                );
                const prefix = account.compteNum.substring(0, 3);
                const isSimilarGroupStart =
                  index === 0 ||
                  filteredAndSortedAccounts[index - 1].compteNum.substring(
                    0,
                    3
                  ) !== prefix;

                return (
                  <tr
                    key={account.compteNum}
                    className={`border-b border-gray-100 ${
                      !account.isMapped ? "bg-yellow-50/50" : ""
                    } ${
                      state.hasChanges ? "bg-blue-50/50" : ""
                    } ${
                      isSimilarGroupStart && prefixFilter === ""
                        ? "border-t-2 border-blue-200"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {account.compteNum}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {account.compteLib || "-"}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm text-right font-medium ${getAmountColor(
                        account.netAmount
                      )}`}
                    >
                      {formatAmount(account.netAmount)} €
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          account.isMapped
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {account.isMapped ? "Mappé" : "Non mappé"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={state.grandeCategorie}
                        onChange={(e) =>
                          handleGrandeCategorieChange(
                            account.compteNum,
                            e.target.value
                          )
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent"
                      >
                        <option value="">-</option>
                        {grandesCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={state.sousCategorie}
                        onChange={(e) =>
                          handleSousCategorieChange(
                            account.compteNum,
                            e.target.value
                          )
                        }
                        disabled={!state.grandeCategorie}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">
                          {!state.grandeCategorie
                            ? "-"
                            : sousCategories.length === 0
                            ? "Aucune"
                            : "-"}
                        </option>
                        {sousCategories.map((subCat) => (
                          <option key={subCat} value={subCat}>
                            {subCat}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={state.concept}
                        onChange={(e) =>
                          handleConceptChange(account.compteNum, e.target.value)
                        }
                        disabled={
                          !state.grandeCategorie || !state.sousCategorie
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">
                          {!state.grandeCategorie || !state.sousCategorie
                            ? "-"
                            : concepts.length === 0
                            ? "Aucun"
                            : "-"}
                        </option>
                        {concepts.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      {state.grandeCategorie &&
                        state.sousCategorie &&
                        concepts.length === 0 && (
                          <input
                            type="text"
                            value={state.concept}
                            onChange={(e) =>
                              handleConceptChange(account.compteNum, e.target.value)
                            }
                            placeholder="Nouveau concept"
                            className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#562CFF]"
                          />
                        )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      <button
                        onClick={() => handleSaveRow(account)}
                        disabled={!canSaveRow(account)}
                        className="px-3 py-1.5 bg-[#562CFF] text-white rounded text-xs font-medium hover:bg-[#4521cc] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        Sauvegarder
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex-shrink-0 text-sm text-gray-600">
          <span className="font-medium">{filteredAndSortedAccounts.length}</span> compte(s) affiché(s)
          {prefixFilter && (
            <span className="ml-2">
              (filtré par préfixe: {prefixFilter}xx)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

