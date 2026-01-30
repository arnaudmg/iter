"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
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

interface ToastItem {
  id: string;
  content: (close: () => void) => React.ReactNode;
}

interface AIInsight {
  id: string;
  title: string;
  body: string;
  tone?: "info" | "warning" | "success" | "neutral";
  buttons?: Array<{ label: string; primary?: boolean }>;
}

type MappingValue = {
  concept: string;
  grandeCategorie: string;
  sousCategorie: string;
};

const FEC_MAPPINGS_STORAGE_KEY = "fec-account-mappings";

function loadMappingsFromStorage(): Map<string, MappingValue> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(FEC_MAPPINGS_STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, MappingValue>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveMappingsToStorage(
  map: Map<string, MappingValue>
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      FEC_MAPPINGS_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(map))
    );
  } catch {
    // ignore quota / private mode
  }
}

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
    Map<string, MappingValue>
  >(new Map());

  // Charger les mappings sauvegardés depuis le navigateur au montage
  useEffect(() => {
    setCustomMappings(loadMappingsFromStorage());
  }, []);

  // Ré-appliquer les mappings au FEC courant quand customMappings change (ex. chargement localStorage)
  useEffect(() => {
    if (fecData.length === 0) return;
    const processed = processRawFEC(fecData, customMappings);
    setOperatingModel(processed);
    const unmapped = getUnmappedEntries(fecData);
    const filtered = unmapped.filter((acc) => !customMappings.has(acc.compteNum));
    setUnmappedAccounts(filtered);
  }, [customMappings, fecData]);

  const [view, setView] = useState<View>("p&l");
  const [toastShown, setToastShown] = useState(false);

  // AI-generated insights (Claude)
  const [aiInsights, setAiInsights] = useState<AIInsight[] | null>(null);
  const [insightsFetched, setInsightsFetched] = useState(false);
  const insightsRequestedRef = useRef(false);

  // Toast Queue Management
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([]);
  const [isToastActive, setIsToastActive] = useState(false);
  const activeToastIdRef = useRef<string | number | null>(null);

  const recurrentMock = {
    date: "15/03/2024",
    label: "Loyer bureaux",
    amount: 12400,
    periodicity: "mensuelle",
  };

  const yoyBadges = [
    { label: "Charges fixes +8 % vs N-1", tone: "bg-amber-100 text-amber-800" },
    { label: "Revenus -5 % vs N-1", tone: "bg-rose-100 text-rose-800" },
    {
      label: "Cash-out mensuel +6 % vs moyenne 6m",
      tone: "bg-yellow-100 text-yellow-800",
    },
  ];

  const provisionReminders = [
    { label: "TVA", date: "15/04", amount: "18 000 €" },
    { label: "URSSAF", date: "30/04", amount: "12 000 €" },
    { label: "Loyers", date: "05/04", amount: "12 400 €" },
  ];

  const opportunityMock = {
    title: "Encaissement exceptionnel N-1 détecté",
    detail: "Prime client 45 k€ — l’intégrer en forecast ?",
  };

  const forecastVsRealized = [
    "P&L actuel vs hypothèses : +6 % charges",
    "P&L actuel vs hypothèses : -3 % revenus",
  ];

  const riskItems = [
    {
      label: "Prestataire IT - +32 % vs moyenne 6m",
      badge: "récurrent estimé",
      tone: "bg-amber-100 text-amber-800",
    },
    {
      label: "Nouveau fournisseur marketing - 18 k€",
      badge: "exceptionnel ?",
      tone: "bg-rose-100 text-rose-800",
    },
    {
      label: "Loyer indexé - +5 % ce mois",
      badge: "récurrent estimé",
      tone: "bg-green-100 text-green-800",
    },
  ];

  const handleFileProcessed = (data: FECEntry[]) => {
    setIsProcessing(true);
    setError(null);
    setFecData(data);
    setToastShown(false);
    setToastQueue([]); // Reset queue
    setIsToastActive(false);
    setAiInsights(null);
    setInsightsFetched(false);
    insightsRequestedRef.current = false;
    if (activeToastIdRef.current) {
      toast.dismiss(activeToastIdRef.current);
      activeToastIdRef.current = null;
    }

    try {
      // Valider les écritures comptables
      const validation = validateEcritures(data);
      setValidationResult(validation);

      // Calculer le solde global (toutes les écritures)
      const balance = calculateGlobalBalance(data);
      setGlobalBalance(balance);

      // operatingModel et unmappedAccounts sont mis à jour par l'effet qui dépend de fecData + customMappings
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
    mapping: MappingValue
  ) => {
    const newMap = new Map(customMappings);
    newMap.set(account.compteNum, mapping);

    setCustomMappings(newMap);
    saveMappingsToStorage(newMap);

    if (fecData.length > 0) {
      const processed = processRawFEC(fecData, newMap);
      setOperatingModel(processed);
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
      mapping: MappingValue;
    }>
  ) => {
    setCustomMappings((prev) => {
      const newMap = new Map(prev);
      mappings.forEach(({ account, mapping }) => {
        newMap.set(account.compteNum, mapping);
      });

      saveMappingsToStorage(newMap);

      if (fecData.length > 0) {
        const processed = processRawFEC(fecData, newMap);
        setOperatingModel(processed);
        const unmapped = getUnmappedEntries(fecData);
        const filteredUnmapped = unmapped.filter(
          (acc) => !newMap.has(acc.compteNum)
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

  const mappingHealth = useMemo(() => {
    const total = getAllAccountsWithCustomMappings.length;
    const mapped = getAllAccountsWithCustomMappings.filter(
      (a) => (a as any).isMapped
    ).length;
    const mappedPct = total > 0 ? Math.round((mapped / total) * 100) : 0;
    const unbalancedCount = validationResult?.unbalancedEcritures?.length ?? 0;
    const netDelta = globalBalance?.netBalance ?? 0;
    return { mappedPct, unbalancedCount, netDelta, total, mapped };
  }, [
    getAllAccountsWithCustomMappings,
    validationResult?.unbalancedEcritures,
    globalBalance?.netBalance,
  ]);

  const addProvisionConfirmation = () => {
    const confirmationItem: ToastItem = {
      id: "provision-confirmation",
      content: (close) => (
        <div className="w-full">
          <p className="text-sm font-semibold text-purple-900">
            Provision ajoutée pour avril (12 400 €)
          </p>
          <p className="text-xs text-gray-600">
            Ligne projetée dans le forecast (mock).
          </p>
          <div className="mt-3 flex justify-end">
            <button
              onClick={close}
              className="rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-900 hover:bg-purple-50"
            >
              Voir dans tableau
            </button>
          </div>
        </div>
      ),
    };

    // Add confirmation as the NEXT item in the queue (index 1)
    // When current toast closes (index 0), this will become index 0
    setToastQueue((prev) => {
      if (prev.length === 0) return [confirmationItem];
      // Insert after current
      return [prev[0], confirmationItem, ...prev.slice(1)];
    });
  };

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
    saveMappingsToStorage(new Map());
    setColumnHeaders({
      category: "Category / Subcategory",
      amount: "Amount (€)",
    });
    setToastShown(false);
    toast.dismiss();
    setToastQueue([]);
    setIsToastActive(false);
    if (activeToastIdRef.current) {
      toast.dismiss(activeToastIdRef.current);
      activeToastIdRef.current = null;
    }
  };

  // Request AI insights when FEC has been processed
  useEffect(() => {
    if (
      fecData.length === 0 ||
      toastShown ||
      insightsRequestedRef.current ||
      validationResult === null
    ) {
      return;
    }
    insightsRequestedRef.current = true;

    const payload = {
      validationResult,
      globalBalance,
      mappingHealth,
      unmappedAccountsSummary: unmappedAccounts.map(
        ({ compteNum, compteLib, netAmount, count }) => ({
          compteNum,
          compteLib,
          netAmount,
          count,
        })
      ),
      operatingModelSummary: operatingModel
        .filter((r) => r.type === "category")
        .map((r) => ({
          category: r.category,
          amount: r.amount,
          subCount: r.children?.length ?? 0,
        })),
      fecEntryCount: fecData.length,
    };

    fetch("/api/analyze-fec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
      .then((data: { insights: AIInsight[] }) => {
        setAiInsights(data.insights ?? []);
        setInsightsFetched(true);
      })
      .catch(() => {
        setInsightsFetched(true);
      });
  }, [
    fecData.length,
    toastShown,
    validationResult,
    globalBalance,
    mappingHealth,
    unmappedAccounts,
    operatingModel,
  ]);

  // Build toast queue from AI insights (or fallback to mocks) once insights are ready
  useEffect(() => {
    if (!insightsFetched || toastShown || fecData.length === 0) return;

    const toneClasses: Record<string, string> = {
      success: "border-green-200 bg-green-50 text-green-900",
      warning: "border-amber-200 bg-amber-50 text-amber-900",
      info: "border-blue-200 bg-blue-50 text-blue-900",
      neutral: "border-gray-200 bg-gray-50 text-gray-900",
    };

    if (aiInsights && aiInsights.length > 0) {
      const newQueue: ToastItem[] = aiInsights.map((insight) => ({
        id: insight.id,
        content: (close) => (
          <div
            className={`w-full rounded-lg border p-3 ${toneClasses[insight.tone ?? "neutral"] ?? toneClasses.neutral}`}
          >
            <p className="text-sm font-semibold">{insight.title}</p>
            <p className="mt-1 text-sm opacity-90">{insight.body}</p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {insight.buttons?.map((btn) => (
                <button
                  key={btn.label}
                  onClick={close}
                  className={
                    btn.primary
                      ? "rounded-lg bg-[#562CFF] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#4521cc]"
                      : "rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                  }
                >
                  {btn.label}
                </button>
              ))}
              {(!insight.buttons || insight.buttons.length === 0) && (
                <button
                  onClick={close}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                >
                  Fermer
                </button>
              )}
            </div>
          </div>
        ),
      }));
      setToastQueue(newQueue);
    } else {
      // Fallback: static mocks when API unavailable or failed
      const newQueue: ToastItem[] = [
      {
        id: "recurrent",
        content: (close) => (
          <div className="w-full">
            <p className="text-sm font-semibold text-purple-900">
              Dépense récurrente détectée
            </p>
            <p className="mt-1 text-sm text-gray-800">
              {recurrentMock.date} — {recurrentMock.label} —{" "}
              {new Intl.NumberFormat("fr-FR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(recurrentMock.amount)}{" "}
              € — périodicité estimée : {recurrentMock.periodicity}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  addProvisionConfirmation();
                  close();
                }}
                className="rounded-lg bg-[#562CFF] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#4521cc]"
              >
                Ajouter au forecast
              </button>
              <button
                onClick={close}
                className="rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-900 hover:bg-purple-50"
              >
                Ignorer ce mois-ci
              </button>
            </div>
          </div>
        ),
      },
      {
        id: "opportunity",
        content: (close) => (
          <div className="w-full">
            <p className="text-sm font-semibold text-green-900">
              {opportunityMock.title}
            </p>
            <p className="mt-1 text-sm text-gray-800">
              {opportunityMock.detail}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={close}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-green-700"
              >
                Inclure
              </button>
              <button
                onClick={close}
                className="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-900 hover:bg-green-50"
              >
                Classer exceptionnel
              </button>
            </div>
          </div>
        ),
      },
      {
        id: "yoy",
        content: (close) => (
          <div className="w-full">
            <p className="text-sm font-semibold text-gray-900">
              Dérive vs N-1 (mock)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {yoyBadges.map((badge) => (
                <span
                  key={badge.label}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.tone}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={close}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>
          </div>
        ),
      },
      {
        id: "mapping",
        content: (close) => (
          <div className="w-full">
            <p className="text-sm font-semibold text-gray-900">
              Santé de mapping (mock)
            </p>
            <div className="mt-2 space-y-1 text-sm text-gray-800">
              <p>
                Comptes mappés: {mappingHealth.mapped} / {mappingHealth.total} (
                {mappingHealth.mappedPct}%)
              </p>
              <p>Écritures déséquilibrées: {mappingHealth.unbalancedCount}</p>
              <p>
                Delta net vs équilibre global:{" "}
                {new Intl.NumberFormat("fr-FR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(mappingHealth.netDelta)}{" "}
                €
              </p>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={close}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
              >
                Mapper
              </button>
              <button
                onClick={close}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
              >
                Voir détails
              </button>
            </div>
          </div>
        ),
      },
      {
        id: "provisions",
        content: (close) => (
          <div className="w-full">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  Échéances à provisionner (mock)
                </p>
                <p className="text-xs text-blue-800">
                  Dates et montants suggérés pour anticiper les sorties
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-50"
              >
                Intégrer en charges à payer
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {provisionReminders.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border border-blue-100 bg-white px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {item.label}
                    </p>
                    <p className="text-xs text-gray-500">
                      Échéance {item.date}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">
                    {item.amount}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={close}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-50"
              >
                Fermer
              </button>
            </div>
          </div>
        ),
      },
      {
        id: "risk",
        content: (close) => (
          <div className="w-full">
            <p className="text-sm font-semibold text-gray-900">
              Top postes à risque (mock)
            </p>
            <div className="mt-2 space-y-2">
              {riskItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2"
                >
                  <div className="text-sm text-gray-900">{item.label}</div>
                  <span
                    className={`ml-2 rounded-full px-3 py-1 text-[11px] font-semibold ${item.tone}`}
                  >
                    {item.badge}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={close}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
              >
                Ouvrir détails compte
              </button>
            </div>
          </div>
        ),
      },
      {
        id: "forecast",
        content: (close) => (
          <div className="w-full">
            <p className="text-sm font-semibold text-gray-900">
              Forecast vs réalisé (mock)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {forecastVsRealized.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-800"
                >
                  {chip}
                </span>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={close}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
              >
                Adapter hypothèses
              </button>
            </div>
          </div>
        ),
      },
    ];
      setToastQueue(newQueue);
    }
    setToastShown(true);
  }, [
    fecData.length,
    toastShown,
    insightsFetched,
    aiInsights,
    provisionReminders,
    yoyBadges,
    recurrentMock,
    mappingHealth,
    riskItems,
    forecastVsRealized,
    opportunityMock,
  ]);

  // Process Toast Queue
  useEffect(() => {
    if (toastQueue.length > 0 && !isToastActive) {
      const currentItem = toastQueue[0];
      const remainingCount = toastQueue.length;
      setIsToastActive(true);

      const id = toast(
        ({ closeToast }) => (
          <div className="relative w-full">
            {/* Badge: Shows total remaining including this one */}
            <div className="absolute -top-6 -right-5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow-md z-50 ring-2 ring-white">
              {remainingCount}
            </div>
            {currentItem.content(() => {
              // Custom close handler passed to content
              // closeToast() will trigger onClose which processes queue
              closeToast?.();
            })}
          </div>
        ),
        {
          autoClose: false,
          closeButton: false,
          closeOnClick: false,
          draggable: false,
          position: "top-right",
          hideProgressBar: true,
          onClose: () => {
            setIsToastActive(false);
            setToastQueue((prev) => prev.slice(1));
            activeToastIdRef.current = null;
          },
        }
      );
      activeToastIdRef.current = id;
    }
  }, [toastQueue, isToastActive]);

  const totalAmount = useMemo(() => {
    return operatingModel.reduce((sum, row) => sum + row.amount, 0);
  }, [operatingModel]);

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-7xl mx-auto">
        <ToastContainer
          position="top-right"
          newestOnTop
          closeOnClick={false}
          draggable={false}
          pauseOnHover={false}
          hideProgressBar
        />
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
