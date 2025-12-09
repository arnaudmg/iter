"use client";

import { useState, useMemo } from "react";

interface Category {
  id: string;
  label: string;
}

interface Transaction {
  id: string;
  date: string;
  amount: number;
  currency: string;
  label: string;
  customer: object | null;
  supplier: object | null;
  categories: Category[];
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentMonthTransactions, setCurrentMonthTransactions] = useState<
    Transaction[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountReceivable, setAccountReceivable] = useState<number | null>(
    null
  );
  const [loadingReceivable, setLoadingReceivable] = useState(false);
  const [hasMadeApiCall, setHasMadeApiCall] = useState(false);

  // Calcul des dates par défaut en utilisant le fuseau horaire local
  const getDefaultDates = () => {
    const today = new Date();
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(today.getDate() - 14);

    // Format YYYY-MM-DD en utilisant le fuseau horaire local
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    return {
      startDate: formatLocalDate(fourteenDaysAgo),
      endDate: formatLocalDate(today),
    };
  };

  const defaultDates = getDefaultDates();
  const [startDate, setStartDate] = useState<string>(defaultDates.startDate);
  const [endDate, setEndDate] = useState<string>(defaultDates.endDate);
  const [showTable, setShowTable] = useState(true);

  // Burn prévisionnel mensuel (en k€)
  const [monthlyBurnTarget, setMonthlyBurnTarget] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("monthlyBurnTarget");
      if (stored) {
        // Convertir les anciennes valeurs en euros vers k€ (diviser par 1000)
        const valueInEuros = parseFloat(stored);
        if (valueInEuros > 1000) {
          // Probablement une ancienne valeur en euros, convertir en k€
          return (valueInEuros / 1000).toString();
        }
        return stored;
      }
    }
    return "";
  });

  const fetchTransactions = () => {
    setLoading(true);
    setError(null);
    setHasMadeApiCall(true);

    const params = new URLSearchParams({
      startDate,
      endDate,
    });

    fetch(`/api/transactions?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        console.log("Data received on client:", data);
        setTransactions(data.items || []);
        setLoading(false);
        // Recharger aussi les transactions du mois en cours pour mettre à jour le burn
        fetchCurrentMonthTransactions();
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  const fetchAccountReceivable = () => {
    setLoadingReceivable(true);
    setHasMadeApiCall(true);
    const params = new URLSearchParams({
      startDate,
      endDate,
    });

    fetch(`/api/invoices?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch account receivable");
        return res.json();
      })
      .then((data) => {
        setAccountReceivable(data.accountReceivable);
        setLoadingReceivable(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingReceivable(false);
      });
  };

  // Charger les transactions du mois en cours pour le calcul du burn
  const fetchCurrentMonthTransactions = () => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthStart = firstDayOfMonth.toISOString().split("T")[0];
    const monthEnd = lastDayOfMonth.toISOString().split("T")[0];

    const params = new URLSearchParams({
      startDate: monthStart,
      endDate: monthEnd,
    });

    fetch(`/api/transactions?${params.toString()}`)
      .then((res) => {
        if (!res.ok) return;
        return res.json();
      })
      .then((data) => {
        if (data && data.items) {
          setCurrentMonthTransactions(data.items || []);
        }
      })
      .catch((err) => {
        // Silently fail for current month transactions
        console.error("Error fetching current month transactions:", err);
      });
  };

  // Supprimé : les appels API ne se font plus automatiquement au chargement
  // Ils se font uniquement via les boutons

  const { cashIn, cashOut } = useMemo(() => {
    const cashIn = transactions
      .filter((t) => t.customer)
      .reduce((acc, t) => acc + parseFloat(t.amount as unknown as string), 0);

    const cashOut = transactions
      .filter((t) => !t.customer)
      .reduce((acc, t) => acc + parseFloat(t.amount as unknown as string), 0);
    return { cashIn, cashOut };
  }, [transactions]);

  // Calcul du burn du mois en cours (cash out en valeur absolue car toujours négatif)
  const currentMonthBurn = useMemo(() => {
    const totalCashOut = currentMonthTransactions
      .filter((t) => !t.customer)
      .reduce((acc, t) => acc + parseFloat(t.amount as unknown as string), 0);
    // Le cash out est toujours négatif, on prend la valeur absolue pour avoir un nombre positif
    return Math.abs(totalCashOut);
  }, [currentMonthTransactions]);

  // Calcul du pourcentage du burn prévu (convertir k€ en euros)
  const burnPercentage = useMemo(() => {
    const targetInK = parseFloat(monthlyBurnTarget);
    if (!targetInK || targetInK === 0) return null;
    const targetInEuros = targetInK * 1000; // Convertir k€ en euros
    return (currentMonthBurn / targetInEuros) * 100;
  }, [currentMonthBurn, monthlyBurnTarget]);

  // Sauvegarder le prévisionnel dans localStorage
  const handleBurnTargetChange = (value: string) => {
    setMonthlyBurnTarget(value);
    if (typeof window !== "undefined") {
      if (value) {
        localStorage.setItem("monthlyBurnTarget", value);
      } else {
        localStorage.removeItem("monthlyBurnTarget");
      }
    }
  };

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-light text-gray-900 tracking-tight">
            Test de l'API Pennylane pour un client
          </h1>{" "}
        </div>

        {/* Filters */}
        <div className="flex items-end gap-4 mb-10">
          <div className="flex-1">
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Date de début
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent text-gray-900"
            />
          </div>
          <div className="flex-1">
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Date de fin
            </label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent text-gray-900"
            />
          </div>
          <button
            onClick={fetchTransactions}
            className="px-8 py-2.5 bg-[#562CFF] text-white rounded-lg hover:bg-[#4521cc] transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:ring-offset-2"
          >
            Transactions
          </button>
          <button
            onClick={fetchAccountReceivable}
            className="px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            disabled={loadingReceivable}
          >
            {loadingReceivable ? "Calcul en cours..." : "Account Receivable"}
          </button>
        </div>

        {/* Stats Cards */}
        {!loading && !error && transactions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            <div className="bg-white border border-gray-200 p-8 rounded-2xl">
              <div className="text-sm font-medium text-gray-500 mb-2">
                Total Cash In
              </div>
              <div className="text-3xl font-light text-green-600">
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                }).format(cashIn)}
              </div>
            </div>
            <div className="bg-white border border-gray-200 p-8 rounded-2xl">
              <div className="text-sm font-medium text-gray-500 mb-2">
                Total Cash Out
              </div>
              <div className="text-3xl font-light text-red-600">
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                }).format(cashOut)}
              </div>
            </div>
            {accountReceivable !== null && (
              <div className="bg-white border border-gray-200 p-8 rounded-2xl">
                <div className="text-sm font-medium text-gray-500 mb-2">
                  Account Receivable
                </div>
                <div className="text-3xl font-light text-blue-600">
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                  }).format(accountReceivable)}
                </div>
              </div>
            )}
            <div className="bg-white border border-gray-200 p-8 rounded-2xl">
              <label
                htmlFor="burnTarget"
                className="block text-sm font-medium text-gray-500 mb-2"
              >
                Prévisionnel burn mensuel (k€)
              </label>
              <input
                type="number"
                id="burnTarget"
                value={monthlyBurnTarget}
                onChange={(e) => handleBurnTargetChange(e.target.value)}
                placeholder="Ex: 50"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent text-gray-900 text-2xl font-light"
              />
            </div>
            {burnPercentage !== null ? (
              <div className="bg-white border border-gray-200 p-8 rounded-2xl">
                <div className="text-sm font-medium text-gray-500 mb-2">
                  Burn du mois en cours
                </div>
                <div className="text-2xl font-light text-red-600 mb-4">
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                  }).format(currentMonthBurn)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        burnPercentage >= 100
                          ? "bg-red-600"
                          : burnPercentage >= 80
                          ? "bg-orange-500"
                          : "bg-[#562CFF]"
                      }`}
                      style={{ width: `${Math.min(burnPercentage, 100)}%` }}
                    />
                  </div>
                  <span
                    className={`text-lg font-semibold whitespace-nowrap ${
                      burnPercentage >= 100
                        ? "text-red-600"
                        : burnPercentage >= 80
                        ? "text-orange-500"
                        : "text-[#562CFF]"
                    }`}
                  >
                    {burnPercentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 p-8 rounded-2xl">
                <div className="text-sm font-medium text-gray-500 mb-2">
                  Burn du mois en cours
                </div>
                <div className="text-sm text-gray-400">
                  Définissez un prévisionnel pour voir le pourcentage
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-[#562CFF]"></div>
            <p className="mt-4 text-gray-500">Chargement des transactions...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <p className="text-red-800 font-medium">Erreur: {error}</p>
            <p className="text-sm text-red-600 mt-2">
              Vérifiez que votre clé API est correctement configurée dans
              .env.local
            </p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && transactions.length === 0 && (
          <div className="bg-gray-50 rounded-2xl p-12 text-center">
            <p className="text-gray-500">
              {hasMadeApiCall
                ? "Aucune transaction trouvée pour cette période"
                : "Hola buenas, choisis tes dates et clique sur un bouton"}
            </p>
          </div>
        )}

        {/* Transactions Table */}
        {showTable && !loading && !error && transactions.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Label
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Catégories
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Montant
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction, index) => (
                    <tr
                      key={transaction.id}
                      className={`${
                        index !== transactions.length - 1
                          ? "border-b border-gray-100"
                          : ""
                      } hover:bg-gray-50 transition-colors`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {new Date(transaction.date).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {transaction.label}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`px-3 py-1 inline-flex text-xs font-medium rounded-full ${
                            transaction.customer
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {transaction.customer ? "Cash In" : "Cash Out"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex flex-wrap gap-1.5">
                          {transaction.categories.map((category) => (
                            <span
                              key={category.id}
                              className="px-3 py-1 inline-flex text-xs font-medium rounded-full bg-[#562CFF]/10 text-[#562CFF]"
                            >
                              {category.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                          transaction.customer
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: transaction.currency || "EUR",
                        }).format(
                          parseFloat(transaction.amount as unknown as string)
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-mono">
                        {transaction.id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-50 px-6 py-4 text-sm text-gray-600">
              <span className="font-medium">{transactions.length}</span>{" "}
              transaction{transactions.length > 1 ? "s" : ""} au total
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
