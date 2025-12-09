"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  getGrandesCategories,
  getSousCategories,
  getConcepts,
} from "../lib/mappingHelpers";

interface UnmappedAccount {
  compteNum: string;
  compteLib: string;
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
  count: number;
}

interface MapAccountModalProps {
  account: UnmappedAccount | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    account: UnmappedAccount,
    mapping: {
      concept: string;
      grandeCategorie: string;
      sousCategorie: string;
    }
  ) => void;
}

export default function MapAccountModal({
  account,
  isOpen,
  onClose,
  onSave,
}: MapAccountModalProps) {
  const [grandeCategorie, setGrandeCategorie] = useState<string>("");
  const [sousCategorie, setSousCategorie] = useState<string>("");
  const [concept, setConcept] = useState<string>("");

  const grandesCategories = getGrandesCategories();
  const sousCategories = grandeCategorie
    ? getSousCategories(grandeCategorie)
    : [];
  const concepts =
    grandeCategorie && sousCategorie
      ? getConcepts(grandeCategorie, sousCategorie)
      : [];

  // Reset form when account changes
  useEffect(() => {
    if (account) {
      setGrandeCategorie("");
      setSousCategorie("");
      setConcept("");
    }
  }, [account]);

  // Reset sous-catégorie when grande catégorie changes
  useEffect(() => {
    setSousCategorie("");
    setConcept("");
  }, [grandeCategorie]);

  // Reset concept when sous-catégorie changes
  useEffect(() => {
    setConcept("");
  }, [sousCategorie]);

  if (!isOpen || !account) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (grandeCategorie && sousCategorie && concept) {
      onSave(account, {
        concept,
        grandeCategorie,
        sousCategorie,
      });
      onClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-2xl font-light text-gray-900">
            Mapper le compte
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Account Info */}
        <div className="p-6 bg-gray-50 border-b border-gray-200 flex-shrink-0">
          <div className="space-y-2">
            <div>
              <span className="text-sm font-medium text-gray-600">
                Numéro de compte:
              </span>
              <span className="ml-2 font-mono text-gray-900">
                {account.compteNum}
              </span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">
                Libellé:
              </span>
              <span className="ml-2 text-gray-900">
                {account.compteLib || "-"}
              </span>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">
                Montant net:
              </span>
              <span
                className={`ml-2 font-medium ${
                  account.netAmount > 0
                    ? "text-red-600"
                    : account.netAmount < 0
                    ? "text-green-600"
                    : "text-gray-600"
                }`}
              >
                {new Intl.NumberFormat("fr-FR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(account.netAmount)}{" "}
                €
              </span>
            </div>
          </div>
        </div>

        {/* Form - Scrollable content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
          <div className="space-y-6">
            {/* Grande Catégorie */}
            <div className="relative z-[60]">
              <label
                htmlFor="grandeCategorie"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Grande Catégorie <span className="text-red-500">*</span>
              </label>
              <select
                id="grandeCategorie"
                value={grandeCategorie}
                onChange={(e) => setGrandeCategorie(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent text-gray-900 relative z-[60]"
                required
              >
                <option value="">Sélectionnez une grande catégorie</option>
                {grandesCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Sous-Catégorie */}
            <div className="relative z-[60]">
              <label
                htmlFor="sousCategorie"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Sous-Catégorie <span className="text-red-500">*</span>
              </label>
              <select
                id="sousCategorie"
                value={sousCategorie}
                onChange={(e) => setSousCategorie(e.target.value)}
                disabled={!grandeCategorie || sousCategories.length === 0}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed relative z-[60]"
                required
              >
                <option value="">
                  {!grandeCategorie
                    ? "Sélectionnez d'abord une grande catégorie"
                    : sousCategories.length === 0
                    ? "Aucune sous-catégorie disponible"
                    : "Sélectionnez une sous-catégorie"}
                </option>
                {sousCategories.map((subCat) => (
                  <option key={subCat} value={subCat}>
                    {subCat}
                  </option>
                ))}
              </select>
            </div>

            {/* Concept */}
            <div className="relative z-[60]">
              <label
                htmlFor="concept"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Concept <span className="text-red-500">*</span>
              </label>
              <select
                id="concept"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                disabled={
                  !grandeCategorie || !sousCategorie || concepts.length === 0
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed relative z-[60]"
                required
              >
                <option value="">
                  {!grandeCategorie || !sousCategorie
                    ? "Sélectionnez d'abord une grande catégorie et une sous-catégorie"
                    : concepts.length === 0
                    ? "Aucun concept disponible"
                    : "Sélectionnez un concept"}
                </option>
                {concepts.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {grandeCategorie && sousCategorie && concepts.length === 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  Aucun concept existant pour cette combinaison. Vous pouvez en
                  créer un nouveau en le saisissant ci-dessous.
                </p>
              )}
            </div>

            {/* Concept libre si aucun concept disponible */}
            {grandeCategorie && sousCategorie && concepts.length === 0 && (
              <div>
                <label
                  htmlFor="conceptFree"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Nouveau Concept <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="conceptFree"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Saisissez un nouveau concept"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#562CFF] focus:border-transparent text-gray-900"
                  required
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-200 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!grandeCategorie || !sousCategorie || !concept}
              className="px-6 py-2.5 bg-[#562CFF] text-white rounded-lg hover:bg-[#4521cc] transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Sauvegarder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
