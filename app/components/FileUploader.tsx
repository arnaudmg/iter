"use client";

import { useCallback, useState } from "react";
import Papa from "papaparse";
import { FECEntry } from "../lib/types";

interface FileUploaderProps {
  onFileProcessed: (data: FECEntry[]) => void;
  onError: (error: string) => void;
}

export default function FileUploader({
  onFileProcessed,
  onError,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const validateAndProcess = useCallback(
    (data: Record<string, string>[]) => {
      // Nettoyer les headers (trim whitespace)
      if (data.length === 0) {
        onError("Le fichier CSV est vide");
        return;
      }

      // Vérifier la présence des colonnes requises (avec nettoyage des headers)
      const firstRow = data[0];
      const cleanedHeaders = Object.keys(firstRow).map((key) => key.trim());
      
      // Fonction pour trouver une colonne (insensible à la casse et aux espaces)
      const findColumn = (searchKey: string): string | null => {
        const normalizedSearch = searchKey.toLowerCase().trim();
        for (const key of Object.keys(firstRow)) {
          if (key.trim().toLowerCase() === normalizedSearch) {
            return key;
          }
        }
        return null;
      };

      const requiredColumns = ["EcritureNum", "CompteNum", "Debit", "Credit"];
      const missingColumns: string[] = [];
      
      for (const col of requiredColumns) {
        if (!findColumn(col)) {
          missingColumns.push(col);
        }
      }

      if (missingColumns.length > 0) {
        onError(
          `Colonnes manquantes: ${missingColumns.join(", ")}. Colonnes trouvées: ${cleanedHeaders.slice(0, 10).join(", ")}. Vérifiez que le fichier FEC est au bon format.`
        );
        return;
      }

      // Parser et nettoyer les données
      const parsedData: FECEntry[] = data.map((row) => {
        // Nettoyer les headers si nécessaire
        const cleanRow: Record<string, string | number> = {};
        Object.keys(row).forEach((key) => {
          cleanRow[key.trim()] = row[key];
        });

        // Parser Debit et Credit en float
        const debit =
          typeof cleanRow.Debit === "string"
            ? parseFloat(cleanRow.Debit.replace(",", ".")) || 0
            : cleanRow.Debit || 0;
        const credit =
          typeof cleanRow.Credit === "string"
            ? parseFloat(cleanRow.Credit.replace(",", ".")) || 0
            : cleanRow.Credit || 0;

        return {
          JournalCode: String(cleanRow.JournalCode ?? ""),
          JournalLib: String(cleanRow.JournalLib ?? ""),
          EcritureNum: String(cleanRow.EcritureNum ?? ""),
          EcritureDate: String(cleanRow.EcritureDate ?? ""),
          CompteNum: String(cleanRow.CompteNum ?? ""),
          CompteLib: String(cleanRow.CompteLib ?? ""),
          CompAuxNum: String(cleanRow.CompAuxNum ?? ""),
          CompAuxLib: String(cleanRow.CompAuxLib ?? ""),
          PieceRef: String(cleanRow.PieceRef ?? ""),
          PieceDate: String(cleanRow.PieceDate ?? ""),
          EcritureLib: String(cleanRow.EcritureLib ?? ""),
          Debit: debit,
          Credit: credit,
          EcritureLet: String(cleanRow.EcritureLet ?? ""),
          DateLet: String(cleanRow.DateLet ?? ""),
          ValidDate: String(cleanRow.ValidDate ?? ""),
          Montantdevise: cleanRow.Montantdevise
            ? parseFloat(String(cleanRow.Montantdevise).replace(",", ".")) || 0
            : 0,
          Idevise: String(cleanRow.Idevise ?? ""),
        };
      });

      onFileProcessed(parsedData);
      setIsProcessing(false);
    },
    [onFileProcessed, onError]
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        onError("Veuillez sélectionner un fichier CSV");
        return;
      }

      setFileName(file.name);
      setIsProcessing(true);
      onError(""); // Clear previous errors

      Papa.parse(file, {
        header: true,
        dynamicTyping: false, // On parse manuellement pour gérer les virgules
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn("Erreurs de parsing:", results.errors);
          }
          validateAndProcess(results.data as Record<string, string>[]);
        },
        error: (error) => {
          onError(`Erreur lors du parsing du CSV: ${error.message}`);
          setIsProcessing(false);
        },
      });
    },
    [validateAndProcess, onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center transition-colors
          ${
            isDragging
              ? "border-[#562CFF] bg-[#562CFF]/5"
              : "border-gray-300 bg-gray-50"
          }
          ${isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          disabled={isProcessing}
          className="hidden"
          id="fec-file-input"
        />
        <label
          htmlFor="fec-file-input"
          className="cursor-pointer block"
          onClick={(e) => {
            if (isProcessing) {
              e.preventDefault();
            }
          }}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-4">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-[#562CFF]"></div>
              <p className="text-gray-600">Traitement du fichier...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <svg
                className="w-12 h-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div>
                <p className="text-gray-700 font-medium">
                  Glissez-déposez votre fichier FEC ici
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  ou cliquez pour sélectionner un fichier CSV
                </p>
              </div>
            </div>
          )}
        </label>
      </div>
      {fileName && !isProcessing && (
        <div className="mt-4 text-sm text-gray-600">
          Fichier chargé: <span className="font-medium">{fileName}</span>
        </div>
      )}
    </div>
  );
}

