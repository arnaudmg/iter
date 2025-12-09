"use client";

import { useState, useMemo } from "react";
import Papa from "papaparse";
import { FECEntry, OperatingModelRow } from "../lib/types";
import {
  processRawFEC,
  validateEcritures,
  calculateGlobalBalance,
  getUnmappedEntries,
  getAllAccounts,
} from "../lib/fecProcessor";
import FileUploader from "../components/FileUploader";
import OperatingModelTable from "../components/OperatingModelTable";
import UnmappedAccountsTable from "../components/UnmappedAccountsTable";
import MapAccountModal from "../components/MapAccountModal";
import AccountsSpreadsheetModal from "../components/AccountsSpreadsheetModal";

type View = "p&l" | "balance-sheet";

export default function FECPage() {
  const [fecData, setFecData] = useState<FECEntry[]>([]);
  const [operatingModel, setOperatingModel] = useState<OperatingModelRow[]>([]);
  const [columnHeaders, setColumnHeaders] = useState({
    category: "Category / Subcategory",
    amount: "Amount (€)",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    unbalancedEcritures: Array<{
      ecritureNum: string;
      totalDebit: number;
      totalCredit: number;
      difference: number;
    }>;
  } | null>(null);
  const [globalBalance, setGlobalBalance] = useState<{
    totalDebit: number;
    totalCredit: number;
    netBalance: number;
    isBalanced: boolean;
  } | null>(null);
  const [unmappedAccounts, setUnmappedAccounts] = useState<
    Array<{
      compteNum: string;
      compteLib: string;
      totalDebit: number;
      totalCredit: number;
      netAmount: number;
      count: number;
    }>
  >([]);
  const [selectedAccount, setSelectedAccount] = useState<{
    compteNum: string;
    compteLib: string;
    totalDebit: number;
    totalCredit: number;
    netAmount: number;
    count: number;
  } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSpreadsheetModalOpen, setIsSpreadsheetModalOpen] = useState(false);
  const [customMappings, setCustomMappings] = useState<
    Map<
      string,
      {
        concept: string;
        grandeCategorie: string;
        sousCategorie: string;
      }
    >
  >(new Map());
  const [view, setView] = useState<View>("p&l");

  const handleFileProcessed = (data: FECEntry[]) => {
    setIsProcessing(true);
    setError(null);
    setFecData(data);

    try {
      // Valider les écritures comptables
      const validation = validateEcritures(data);
      setValidationResult(validation);

      // Calculer le solde global (toutes les écritures)
      const balance = calculateGlobalBalance(data);
      setGlobalBalance(balance);

      // Extraire les comptes non mappés (en excluant ceux déjà mappés manuellement)
      const unmapped = getUnmappedEntries(data);
      // Filtrer les comptes qui ont été mappés manuellement dans cette session
      const filteredUnmapped = unmapped.filter(
        (account) => !customMappings.has(account.compteNum)
      );
      setUnmappedAccounts(filteredUnmapped);

      // Traiter les données même si certaines écritures sont déséquilibrées
      const processed = processRawFEC(data, customMappings);
      setOperatingModel(processed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors du traitement des données"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setIsProcessing(false);
  };

  const handleCategoryToggle = (categoryId: string) => {
    setOperatingModel((prev) =>
      prev.map((row) => {
        if (row.id === categoryId && row.type === "category") {
          return {
            ...row,
            isCollapsed: !row.isCollapsed,
          };
        }
        return row;
      })
    );
  };

  const handleSubCategoryToggle = (
    categoryId: string,
    subCategoryId: string
  ) => {
    setOperatingModel((prev) =>
      prev.map((row) => {
        if (row.id === categoryId && row.type === "category" && row.children) {
          return {
            ...row,
            children: row.children.map((subRow) => {
              if (subRow.id === subCategoryId) {
                return {
                  ...subRow,
                  isCollapsed: !subRow.isCollapsed,
                };
              }
              return subRow;
            }),
          };
        }
        return row;
      })
    );
  };

  const handleConceptToggle = (
    categoryId: string,
    subCategoryId: string,
    conceptId: string
  ) => {
    setOperatingModel((prev) =>
      prev.map((categoryRow) => {
        if (categoryRow.id === categoryId && categoryRow.children) {
          return {
            ...categoryRow,
            children: categoryRow.children.map((subRow) => {
              if (subRow.id === subCategoryId && subRow.children) {
                return {
                  ...subRow,
                  children: subRow.children.map((conceptRow) => {
                    if (conceptRow.id === conceptId) {
                      return {
                        ...conceptRow,
                        isCollapsed: !conceptRow.isCollapsed,
                      };
                    }
                    return conceptRow;
                  }),
                };
              }
              return subRow;
            }),
          };
        }
        return categoryRow;
      })
    );
  };

  const handleHeaderRename = (columnKey: string, newName: string) => {
    setColumnHeaders((prev) => ({
      ...prev,
      [columnKey]: newName,
    }));
  };

  const handleExportCSV = () => {
    if (operatingModel.length === 0) {
      setError("Aucune donnée à exporter");
      return;
    }

    const flatData = operatingModel.flatMap((category) => {
      if (category.type === "category" && category.children) {
        return category.children.map((sub) => ({
          "Grande Catégorie": category.category,
          "Sous-Catégorie": sub.subCategory || "",
          Montant: sub.amount,
        }));
      }
      return [];
    });

    const csv = Papa.unparse(flatData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `operating-model-${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredOperatingModel = useMemo(() => {
    const filterAccount = (accountNum: string) => {
      if (view === "p&l") {
        return accountNum.startsWith("6") || accountNum.startsWith("7");
      }
      if (view === "balance-sheet") {
        return !accountNum.startsWith("6") && !accountNum.startsWith("7");
      }
      return true; // Ne devrait pas arriver, mais au cas où
    };

    const filterRecursively = (
      rows: OperatingModelRow[]
    ): OperatingModelRow[] => {
      return rows
        .map((row): OperatingModelRow | null => {
          if (row.children) {
            const filteredChildren = filterRecursively(row.children);
            if (filteredChildren.length > 0) {
              return { ...row, children: filteredChildren };
            }
          }

          // Keep row if any of its accounts match the filter
          if (row.accountNumbers?.some(filterAccount)) {
            return { ...row, children: [] }; // Leaf node that matches
          }

          return null;
        })
        .filter((row) => row !== null);
    };

    return filterRecursively(operatingModel);
  }, [operatingModel, view]);

  const handleAccountClick = (account: {
    compteNum: string;
    compteLib: string;
    totalDebit: number;
    totalCredit: number;
    netAmount: number;
    count: number;
  }) => {
    setSelectedAccount(account);
    setIsModalOpen(true);
  };

  const handleSaveMapping = (
    account: {
      compteNum: string;
      compteLib: string;
      totalDebit: number;
      totalCredit: number;
      netAmount: number;
      count: number;
    },
    mapping: {
      concept: string;
      grandeCategorie: string;
      sousCategorie: string;
    }
  ) => {
    // Créer le nouveau Map avec le mapping ajouté
    const newMap = new Map(customMappings);
    newMap.set(account.compteNum, mapping);

    // Sauvegarder le mapping personnalisé
    setCustomMappings(newMap);

    // Retraiter les données avec le nouveau mapping
    if (fecData.length > 0) {
      // Note: Pour l'instant, on garde juste le mapping en mémoire
      // Dans une vraie app, on pourrait ajouter ce mapping au fichier mapping.ts
      // ou le sauvegarder dans une base de données
      console.log("Nouveau mapping ajouté:", {
        account: account.compteNum,
        mapping,
      });

      // Retraiter les données pour mettre à jour l'operating model
      const processed = processRawFEC(fecData, newMap);
      setOperatingModel(processed);

      // Mettre à jour la liste des comptes non mappés
      const unmapped = getUnmappedEntries(fecData);
      const filteredUnmapped = unmapped.filter(
        (acc) => !newMap.has(acc.compteNum)
      );
      setUnmappedAccounts(filteredUnmapped);
    }
  };

  const handleSaveMappingsBatch = (
    mappings: Array<{
      account: {
        compteNum: string;
        compteLib: string;
        totalDebit: number;
        totalCredit: number;
        netAmount: number;
        count: number;
      };
      mapping: {
        concept: string;
        grandeCategorie: string;
        sousCategorie: string;
      };
    }>
  ) => {
    // Sauvegarder tous les mappings en une fois
    setCustomMappings((prev) => {
      const newMap = new Map(prev);
      mappings.forEach(({ account, mapping }) => {
        newMap.set(account.compteNum, mapping);
      });

      // Retraiter les données avec les nouveaux mappings
      if (fecData.length > 0) {
        const processed = processRawFEC(fecData, newMap);
        setOperatingModel(processed);

        // Mettre à jour la liste des comptes non mappés avec le nouveau Map
        const unmapped = getUnmappedEntries(fecData);
        const filteredUnmapped = unmapped.filter(
          (account) => !newMap.has(account.compteNum)
        );
        setUnmappedAccounts(filteredUnmapped);
      }

      return newMap;
    });
  };

  // Obtenir tous les comptes avec les mappings personnalisés appliqués
  const getAllAccountsWithCustomMappings = useMemo(() => {
    if (fecData.length === 0) return [];

    const allAccounts = getAllAccounts(fecData);

    // Appliquer les mappings personnalisés
    return allAccounts.map((account) => {
      const customMapping = customMappings.get(account.compteNum);
      if (customMapping) {
        return {
          ...account,
          isMapped: true,
          mapping: customMapping,
        };
      }
      return account;
    });
  }, [fecData, customMappings]);

  const handleReset = () => {
    setFecData([]);
    setOperatingModel([]);
    setError(null);
    setValidationResult(null);
    setGlobalBalance(null);
    setUnmappedAccounts([]);
    setSelectedAccount(null);
    setIsModalOpen(false);
    setIsSpreadsheetModalOpen(false);
    setCustomMappings(new Map());
    setColumnHeaders({
      category: "Category / Subcategory",
      amount: "Amount (€)",
    });
  };

  const totalAmount = useMemo(() => {
    return operatingModel.reduce((sum, row) => sum + row.amount, 0);
  }, [operatingModel]);

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-light text-gray-900 tracking-tight">
            Operating Model Generator
          </h1>
        </div>

        {/* File Uploader */}
        <div className="mb-8">
          <FileUploader
            onFileProcessed={handleFileProcessed}
            onError={handleError}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-6">
            <p className="text-red-800 font-medium">Erreur: {error}</p>
          </div>
        )}

        {/* Validation Warnings */}
        {validationResult && !validationResult.isValid && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
            <p className="text-yellow-800 font-medium mb-2">
              ⚠️ {validationResult.unbalancedEcritures.length} écriture(s)
              déséquilibrée(s) détectée(s)
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-yellow-700 text-sm font-medium hover:text-yellow-900">
                Voir les détails
              </summary>
              <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                {validationResult.unbalancedEcritures
                  .slice(0, 10)
                  .map((unbalanced) => (
                    <div
                      key={unbalanced.ecritureNum}
                      className="text-sm text-yellow-700 bg-yellow-100 p-2 rounded"
                    >
                      <span className="font-mono font-semibold">
                        Écriture {unbalanced.ecritureNum}
                      </span>
                      {" : "}
                      Débit: {unbalanced.totalDebit.toFixed(2)} €, Crédit:{" "}
                      {unbalanced.totalCredit.toFixed(2)} €{" → "}
                      <span className="font-semibold">
                        Différence: {unbalanced.difference.toFixed(2)} €
                      </span>
                    </div>
                  ))}
                {validationResult.unbalancedEcritures.length > 10 && (
                  <p className="text-yellow-600 text-xs italic">
                    ... et {validationResult.unbalancedEcritures.length - 10}{" "}
                    autre(s) écriture(s)
                  </p>
                )}
              </div>
            </details>
          </div>
        )}

        {/* Validation Success */}
        {validationResult && validationResult.isValid && fecData.length > 0 && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-2xl p-4">
            <p className="text-green-800 text-sm">
              ✓ Toutes les écritures sont équilibrées ({fecData.length} ligne(s)
              traitée(s))
            </p>
          </div>
        )}

        {/* Global Balance Check */}
        {globalBalance && (
          <div
            className={`mb-6 border rounded-2xl p-4 ${
              globalBalance.isBalanced
                ? "bg-green-50 border-green-200"
                : "bg-yellow-50 border-yellow-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className={`font-medium ${
                    globalBalance.isBalanced
                      ? "text-green-800"
                      : "text-yellow-800"
                  }`}
                >
                  {globalBalance.isBalanced ? "✓" : "⚠️"} Équilibre comptable
                  global
                </p>
                <p
                  className={`text-sm mt-1 ${
                    globalBalance.isBalanced
                      ? "text-green-700"
                      : "text-yellow-700"
                  }`}
                >
                  Total Débit:{" "}
                  {new Intl.NumberFormat("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(globalBalance.totalDebit)}{" "}
                  €{" | "}
                  Total Crédit:{" "}
                  {new Intl.NumberFormat("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(globalBalance.totalCredit)}{" "}
                  €
                </p>
              </div>
              <div
                className={`text-right ${
                  globalBalance.isBalanced
                    ? "text-green-800"
                    : "text-yellow-800"
                }`}
              >
                <p className="text-2xl font-bold">
                  {new Intl.NumberFormat("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(globalBalance.netBalance)}{" "}
                  €
                </p>
                <p className="text-xs mt-1">
                  {globalBalance.isBalanced ? "Équilibré ✓" : "Déséquilibré"}
                </p>
              </div>
            </div>
            {!globalBalance.isBalanced && (
              <p className="text-yellow-700 text-xs mt-2 italic">
                Note: Le total des catégories mappées peut différer de 0 car
                seuls les comptes mappés sont inclus. L'équilibre comptable
                global vérifie toutes les écritures (mappées + non mappées).
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {operatingModel.length > 0 && (
          <div className="mb-6 flex items-center justify-between">
            <div className="flex gap-4">
              <button
                onClick={handleExportCSV}
                className="px-6 py-2.5 bg-[#562CFF] text-white rounded-lg hover:bg-[#4521cc] transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:ring-offset-2"
              >
                Export CSV
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              >
                Reset
              </button>
            </div>
            {/* View Filter Buttons */}
            <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-1.5">
              {(["p&l", "balance-sheet"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    view === v
                      ? "bg-white text-gray-900 shadow-sm"
                      : "bg-transparent text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {
                    {
                      "p&l": "P&L",
                      "balance-sheet": "Balance Sheet",
                    }[v]
                  }
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isProcessing && (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-[#562CFF]"></div>
            <p className="mt-4 text-gray-500">Traitement des données...</p>
          </div>
        )}

        {/* Operating Model Table */}
        {!isProcessing && operatingModel.length > 0 && (
          <OperatingModelTable
            data={filteredOperatingModel}
            onCategoryToggle={handleCategoryToggle}
            onSubCategoryToggle={handleSubCategoryToggle}
            onConceptToggle={handleConceptToggle}
            onHeaderRename={handleHeaderRename}
            columnHeaders={columnHeaders}
          />
        )}

        {/* Unmapped Accounts Table */}
        {!isProcessing && unmappedAccounts.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-light text-gray-900">
                Comptes non mappés
              </h2>
              {fecData.length > 0 && (
                <button
                  onClick={() => setIsSpreadsheetModalOpen(true)}
                  className="px-4 py-2 bg-[#562CFF] text-white rounded-lg hover:bg-[#4521cc] transition-colors font-medium"
                >
                  Voir format tableur
                </button>
              )}
            </div>
            <UnmappedAccountsTable
              data={unmappedAccounts}
              onAccountClick={handleAccountClick}
            />
          </div>
        )}

        {/* Show spreadsheet button even if no unmapped accounts */}
        {!isProcessing &&
          unmappedAccounts.length === 0 &&
          fecData.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setIsSpreadsheetModalOpen(true)}
                className="px-4 py-2 bg-[#562CFF] text-white rounded-lg hover:bg-[#4521cc] transition-colors font-medium"
              >
                Voir format tableur
              </button>
            </div>
          )}

        {/* Map Account Modal */}
        <MapAccountModal
          account={selectedAccount}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedAccount(null);
          }}
          onSave={handleSaveMapping}
        />

        {/* Accounts Spreadsheet Modal */}
        <AccountsSpreadsheetModal
          accounts={getAllAccountsWithCustomMappings}
          isOpen={isSpreadsheetModalOpen}
          onClose={() => setIsSpreadsheetModalOpen(false)}
          onSave={handleSaveMapping}
          onSaveAll={handleSaveMappingsBatch}
        />

        {/* Empty State - No file uploaded */}
        {!isProcessing &&
          operatingModel.length === 0 &&
          fecData.length === 0 &&
          !error && (
            <div className="bg-gray-50 rounded-2xl p-12 text-center">
              <p className="text-gray-500">
                Téléchargez un fichier FEC pour commencer
              </p>
            </div>
          )}

        {/* Empty State - File loaded but no data processed */}
        {!isProcessing &&
          operatingModel.length === 0 &&
          fecData.length > 0 &&
          !error && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
              <p className="text-yellow-800 font-medium">
                Fichier chargé mais aucune donnée trouvée
              </p>
              <p className="text-yellow-600 text-sm mt-2">
                Le fichier contient {fecData.length} ligne(s), mais aucun compte
                ne correspond au mapping. Vérifiez que les numéros de compte
                dans le fichier correspondent aux comptes mappés.
              </p>
              <p className="text-yellow-600 text-xs mt-4">
                Comptes trouvés dans le fichier (échantillon):{" "}
                {Array.from(
                  new Set(fecData.slice(0, 10).map((d) => d.CompteNum))
                )
                  .filter((c) => c)
                  .join(", ")}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
