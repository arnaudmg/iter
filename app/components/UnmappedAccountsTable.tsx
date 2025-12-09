"use client";

interface UnmappedAccount {
  compteNum: string;
  compteLib: string;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
  count: number;
}

interface UnmappedAccountsTableProps {
  data: UnmappedAccount[];
  onAccountClick: (account: UnmappedAccount) => void;
}

export default function UnmappedAccountsTable({ data, onAccountClick }: UnmappedAccountsTableProps) {
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

  const totalDebit = data.reduce((sum, item) => sum + item.totalDebit, 0);
  const totalCredit = data.reduce((sum, item) => sum + item.totalCredit, 0);
  const totalNet = data.reduce((sum, item) => sum + item.netAmount, 0);

  if (data.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Numéro de compte
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Libellé
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Total Débit
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Total Crédit
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Net
                </th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Nombre d'écritures
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr
                  key={item.compteNum}
                  onClick={() => onAccountClick(item)}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3 text-sm font-mono text-gray-900">
                    {item.compteNum}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700">
                    {item.compteLib || "-"}
                  </td>
                  <td className="px-6 py-3 text-sm text-right text-gray-700">
                    {formatAmount(item.totalDebit)} €
                  </td>
                  <td className="px-6 py-3 text-sm text-right text-gray-700">
                    {formatAmount(item.totalCredit)} €
                  </td>
                  <td
                    className={`px-6 py-3 text-sm text-right font-medium ${getAmountColor(item.netAmount)}`}
                  >
                    {formatAmount(item.netAmount)} €
                  </td>
                  <td className="px-6 py-3 text-sm text-center text-gray-600">
                    {item.count}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 border-t-2 border-gray-300">
                <td className="px-6 py-4 font-bold text-base text-gray-900" colSpan={2}>
                  TOTAL
                </td>
                <td className="px-6 py-4 text-right font-bold text-base text-gray-700">
                  {formatAmount(totalDebit)} €
                </td>
                <td className="px-6 py-4 text-right font-bold text-base text-gray-700">
                  {formatAmount(totalCredit)} €
                </td>
                <td
                  className={`px-6 py-4 text-right font-bold text-base ${getAmountColor(totalNet)}`}
                >
                  {formatAmount(totalNet)} €
                </td>
                <td className="px-6 py-4 text-center font-bold text-base text-gray-700">
                  {data.reduce((sum, item) => sum + item.count, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="bg-gray-50 px-6 py-4 text-sm text-gray-600">
          <span className="font-medium">{data.length}</span> compte(s) non mappé(s) au total
        </div>
      </div>
    </div>
  );
}

