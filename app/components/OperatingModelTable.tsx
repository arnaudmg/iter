"use client";

import { useMemo, useState } from "react";
import { DataGrid, type Column } from "react-data-grid";
import { ChevronDown, ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";
import { OperatingModelRow } from "../lib/types";

interface OperatingModelTableProps {
  data: OperatingModelRow[];
  onCategoryToggle: (categoryId: string) => void;
  onSubCategoryToggle: (categoryId: string, subCategoryId: string) => void;
  onConceptToggle: (
    categoryId: string,
    subCategoryId: string,
    conceptId: string
  ) => void;
  onHeaderRename: (columnKey: string, newName: string) => void;
  columnHeaders: {
    category: string;
    amount: string;
  };
}

interface FlatRow {
  id: string;
  type: "category" | "subcategory" | "concept" | "total" | "account";
  category: string;
  categoryId?: string;
  subCategory?: string;
  subCategoryId?: string;
  concept?: string;
  amount: number;
  isCollapsed?: boolean;
  [key: string]: string | number | undefined | boolean; // Pour les colonnes mensuelles dynamiques
}

export default function OperatingModelTable({
  data,
  onCategoryToggle,
  onSubCategoryToggle,
  onConceptToggle,
  onHeaderRename,
  columnHeaders,
}: OperatingModelTableProps) {
  const [isBudgetMode, setIsBudgetMode] = useState(false);

  // Extraire toutes les colonnes mensuelles uniques depuis les données
  const monthColumns = useMemo(() => {
    const months = new Set<string>();
    data.forEach((row) => {
      if (row.monthlyAmounts) {
        Object.keys(row.monthlyAmounts).forEach((month) => months.add(month));
      }
      row.children?.forEach((subRow) => {
        if (subRow.monthlyAmounts) {
          Object.keys(subRow.monthlyAmounts).forEach((month) =>
            months.add(month)
          );
        }
        subRow.children?.forEach((conceptRow) => {
          if (conceptRow.monthlyAmounts) {
            Object.keys(conceptRow.monthlyAmounts).forEach((month) =>
              months.add(month)
            );
          }
        });
      });
    });
    // Trier les mois par ordre chronologique
    return Array.from(months).sort();
  }, [data]);

  // Formater le nom du mois pour l'affichage (ex: "2025-01" → "Jan 2025")
  const formatMonthHeader = (monthKey: string) => {
    const [year, month] = monthKey.split("-");
    const monthNames = [
      "Jan",
      "Fév",
      "Mar",
      "Avr",
      "Mai",
      "Jun",
      "Jul",
      "Aoû",
      "Sep",
      "Oct",
      "Nov",
      "Déc",
    ];
    const monthIndex = parseInt(month, 10) - 1;
    return `${monthNames[monthIndex]} ${year}`;
  };

    // Transformer les données hiérarchiques en lignes plates
    const flatRows = useMemo(() => {
      const rows: FlatRow[] = [];
  
      data.forEach((categoryRow) => {
        // Ligne de catégorie
        const categoryFlatRow: FlatRow = {
          id: categoryRow.id,
          type: "category",
          category: categoryRow.category,
          amount: categoryRow.amount, // Ce montant global sera-t-il correct ? Le total global est calculé dans fecProcessor.
          // Pour le "Non-Current Assets" (Bilan), il faut faire attention au cumul.
          // Mais l'utilisateur demande que le montant affiché soit la somme de ce qu'on voit.
          isCollapsed: categoryRow.isCollapsed,
        };

        // Note: Les montants mensuels de categoryRow viennent de fecProcessor qui a déjà fait les sommes.
        // Si on veut que ce soit exactement la somme des enfants affichés, on doit peut-être le recalculer ici ?
        // L'utilisateur dit: "Je veux que l'on somme donc tout ce que l'on voit dans le tableau enfaite si tu veux."
        // Cela suggère que pour les totaux parents, il préfère une somme simple des enfants plutôt qu'une logique comptable complexe (cumul vs flux) qui pourrait être confuse.
        // Cependant, fecProcessor calcule déjà ça correctement normalement.
        // Le problème mentionné "Je veux que le amount, dans mon bilan, de Intangible Assets ne soit pas le montant global mais bien juste le montant de Intangible assets que l'on voit affiché"
        // laisse penser qu'il y a un souci de filtrage ou de cumul qui inclut des choses invisibles ou passées.
        
        // Pour être sûr, recalculons les totaux parents à partir des enfants présents dans `data`.
        // Si `data` contient déjà la bonne structure, fecProcessor a fait le job.
        // Vérifions si le problème vient de l'affichage "Amount" (colonne Total) ou des colonnes mensuelles.
        // "Amount (€)" est souvent la somme des mouvements de la période pour le P&L, mais pour le Bilan c'est le solde final ?
        // Dans fecProcessor: 
        // - P&L: amount = sum(netAmount)
        // - Bilan: amount = sum(netAmount) (c'est aussi la variation nette sur la période du fichier FEC)
        // Si c'est un fichier FEC annuel, amount = variation annuelle.
        
        // L'utilisateur semble pointer du doigt un montant "2 473 615,11 €" pour "Non-Current Assets" alors que les mois montrent ~2.4M.
        // Ah, "Intangible Assets" affiche le même montant énorme alors que ses enfants (IP, Amortization...) ont des petits montants (26k, 500...).
        // C'est le problème ! Le parent a un montant qui ne correspond pas à la somme visuelle des enfants.
        // Cela arrive si le parent inclut des écritures qui n'ont pas été mappées dans des sous-catégories/concepts enfants spécifiques ou si le calcul de solde cumulé (Balance Sheet) prend en compte un historique non affiché (report à nouveau ?).
        // Mais ici on traite un FEC importé, donc on a que les mouvements de l'année (et les RAN si présents).
        
        // SOLUTION : On va recalculer les montants des parents (Category et SubCategory) en sommant EXPLICITEMENT les enfants directs.
        // Comme ça, le tableau est mathématiquement cohérent visuellement : Parent = Somme(Enfants).
        
        // 1. D'abord traiter les enfants pour avoir leurs totaux corrects
        const calculatedSubRows: any[] = [];

        if (categoryRow.children) {
            categoryRow.children.forEach(subRow => {
                // Pour chaque sous-catégorie, recalculer à partir des concepts
                let subAmount = 0;
                const subMonthlyAmounts: {[key: string]: number} = {};
                const subMonthlyBudgets: {[key: string]: number} = {};
                
                const calculatedConceptRows: any[] = [];
                
                if (subRow.children) {
                    subRow.children.forEach(conceptRow => {
                        // Les concepts sont les feuilles, on garde leurs valeurs telles quelles (venant du mapping)
                        // Sauf si on veut aussi filtrer les accountDetails... supposons que concept.amount est juste.
                        subAmount += conceptRow.amount;
                        
                        if (conceptRow.monthlyAmounts) {
                            Object.entries(conceptRow.monthlyAmounts).forEach(([m, val]) => {
                                subMonthlyAmounts[m] = (subMonthlyAmounts[m] || 0) + val;
                            });
                        }
                        if (conceptRow.monthlyBudgets) {
                            Object.entries(conceptRow.monthlyBudgets).forEach(([m, val]) => {
                                subMonthlyBudgets[m] = (subMonthlyBudgets[m] || 0) + val;
                            });
                        }
                        calculatedConceptRows.push(conceptRow);
                    });
                }
                
                // On remplace les valeurs du subRow par la somme calculée des concepts
                // SAUF si c'est vide (auquel cas on garde l'original ou 0 ?)
                // Si un subRow n'a pas d'enfants concepts (cas rare avec le mapping actuel), on garde ses valeurs.
                if (subRow.children && subRow.children.length > 0) {
                    calculatedSubRows.push({
                        ...subRow,
                        amount: subAmount,
                        monthlyAmounts: subMonthlyAmounts,
                        monthlyBudgets: subMonthlyBudgets,
                        children: calculatedConceptRows
                    });
                } else {
                    calculatedSubRows.push(subRow);
                }
            });
        }

        // 2. Recalculer la catégorie à partir des sous-catégories recalculées
        let catAmount = 0;
        const catMonthlyAmounts: {[key: string]: number} = {};
        const catMonthlyBudgets: {[key: string]: number} = {};

        calculatedSubRows.forEach(sub => {
            catAmount += sub.amount;
            if (sub.monthlyAmounts) {
                Object.entries(sub.monthlyAmounts).forEach(([m, val]) => {
                    catMonthlyAmounts[m] = (catMonthlyAmounts[m] || 0) + (val as number);
                });
            }
            if (sub.monthlyBudgets) {
                Object.entries(sub.monthlyBudgets).forEach(([m, val]) => {
                    catMonthlyBudgets[m] = (catMonthlyBudgets[m] || 0) + (val as number);
                });
            }
        });

        // Mise à jour de la ligne catégorie
        categoryFlatRow.amount = catAmount;
        // On écrase les monthlyAmounts de la catégorie avec la somme calculée
        monthColumns.forEach(month => {
            categoryFlatRow[month] = catMonthlyAmounts[month] || 0;
            categoryFlatRow[`${month}_budget`] = catMonthlyBudgets[month] || 0;
        });
        
        rows.push(categoryFlatRow);

        // Ensuite on push les enfants (qui sont déjà recalculés dans calculatedSubRows)
        if (
          categoryRow.type === "category" &&
          !categoryRow.isCollapsed
        ) {
          calculatedSubRows.forEach((subRow) => {
            // Ligne de sous-catégorie
            const subCategoryFlatRow: FlatRow = {
              id: subRow.id,
              type: "subcategory",
              category: categoryRow.category,
              categoryId: categoryRow.id,
              subCategory: subRow.subCategory,
              amount: subRow.amount,
              isCollapsed: subRow.isCollapsed,
            };
  
            if (subRow.monthlyAmounts) {
              (Object.entries(subRow.monthlyAmounts) as [string, number][]).forEach(([month, amount]) => {
                subCategoryFlatRow[month] = amount;
              });
            }
            if (subRow.monthlyBudgets) {
              (Object.entries(subRow.monthlyBudgets) as [string, number][]).forEach(([month, budget]) => {
                subCategoryFlatRow[`${month}_budget`] = budget;
              });
            }
  
            rows.push(subCategoryFlatRow);
  
            // Afficher les concepts si la sous-catégorie n'est pas collabée
            if (!subRow.isCollapsed && subRow.children) {
              subRow.children.forEach((conceptRow: OperatingModelRow) => {
                const conceptFlatRow: FlatRow = {
                  id: conceptRow.id,
                  type: "concept",
                  category: categoryRow.category,
                  categoryId: categoryRow.id,
                  subCategory: subRow.subCategory,
                  subCategoryId: subRow.id,
                  concept: conceptRow.concept,
                  amount: conceptRow.amount,
                  isCollapsed: conceptRow.isCollapsed,
                };
  
                if (conceptRow.monthlyAmounts) {
                  (Object.entries(conceptRow.monthlyAmounts) as [string, number][]).forEach(
                    ([month, amount]) => {
                      conceptFlatRow[month] = amount;
                    }
                  );
                }
                if (conceptRow.monthlyBudgets) {
                    (Object.entries(conceptRow.monthlyBudgets) as [string, number][]).forEach(
                        ([month, budget]) => {
                            conceptFlatRow[`${month}_budget`] = budget;
                        }
                    );
                }
  
                rows.push(conceptFlatRow);
  
                // Afficher les détails de compte si le concept n'est pas collabé
                if (!conceptRow.isCollapsed && conceptRow.accountDetails) {
                  conceptRow.accountDetails.forEach((account) => {
                    const accountDetailRow: FlatRow = {
                      id: `${conceptRow.id}-${account.compteNum}`,
                      type: "account",
                      category: `${account.compteNum} - ${account.compteLib}`, // Display account num and lib
                      amount: account.netAmount,
                    };
                    // Ajouter les montants mensuels pour la ligne de détail de compte
                    if (account.monthlyAmounts) {
                      (Object.entries(account.monthlyAmounts) as [string, number][]).forEach(
                        ([month, amount]) => {
                          accountDetailRow[month] = amount;
                        }
                      );
                    }
                    if (account.monthlyBudgets) {
                      (Object.entries(account.monthlyBudgets) as [string, number][]).forEach(
                        ([month, budget]) => {
                          accountDetailRow[`${month}_budget`] = budget;
                        }
                      );
                    }
                    rows.push(accountDetailRow);
                  });
                }
              });
            }
          });
        }
      });
  
      // Ajouter la ligne de total
      // Le total doit être la somme des catégories recalculées (qui sont la somme de leurs enfants)
      // Donc on peut sommer les rows de type 'category' qu'on vient de créer
      
      const categoryRows = rows.filter(r => r.type === 'category');
      
      const totalAmount = categoryRows.reduce((sum, r) => sum + r.amount, 0);
      const totalMonthlyAmounts: { [key: string]: number } = {};
      const totalMonthlyBudgets: { [key: string]: number } = {};
  
      monthColumns.forEach((month) => {
        totalMonthlyAmounts[month] = categoryRows.reduce((sum, r) => {
          return sum + (r[month] as number || 0);
        }, 0);
        totalMonthlyBudgets[month] = categoryRows.reduce((sum, r) => {
            return sum + (r[`${month}_budget`] as number || 0);
        }, 0);
      });
  
      const totalRow: FlatRow = {
        id: "total",
        type: "total",
        category: "TOTAL",
        amount: totalAmount,
      };
  
      monthColumns.forEach((month) => {
        totalRow[month] = totalMonthlyAmounts[month] || 0;
        totalRow[`${month}_budget`] = totalMonthlyBudgets[month] || 0;
      });
  
      rows.push(totalRow);
  
      return rows;
    }, [data, monthColumns]);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Définir les colonnes
  const columns = useMemo<Column<FlatRow>[]>(() => {
    const cols: Column<FlatRow>[] = [
      {
        key: "category",
        name: columnHeaders.category,
        frozen: true,
        width: 400,
        cellClass: "rdg-cell-frozen-custom",
        headerCellClass: "rdg-header-cell-frozen-custom",
        renderCell: ({ row }) => {
          const style: React.CSSProperties = {
            display: "flex",
            alignItems: "center",
            gap: "8px",
          };

          if (row.type === "total") {
            return (
              <strong style={{ cursor: "default" }}>{row.category}</strong>
            );
          }
          if (row.type === "category") {
            const icon = row.isCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronDown size={16} />
            );
            return (
              <div style={style}>
                <span
                  style={{ cursor: "pointer" }}
                  onClick={() => onCategoryToggle(row.id)}
                >
                  {icon}
                </span>
                <strong>{row.category}</strong>
              </div>
            );
          }
          if (row.type === "subcategory") {
            const icon = row.isCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronDown size={16} />
            );
            return (
              <div style={{ ...style, paddingLeft: "24px" }}>
                <span
                  style={{ cursor: "pointer" }}
                  onClick={() => onSubCategoryToggle(row.categoryId!, row.id)}
                >
                  {icon}
                </span>
                <span>{row.subCategory}</span>
              </div>
            );
          }
          if (row.type === "concept") {
            const icon = row.isCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronDown size={16} />
            );
            return (
              <div style={{ ...style, paddingLeft: "48px" }}>
                <span
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    onConceptToggle(row.categoryId!, row.subCategoryId!, row.id)
                  }
                >
                  {icon}
                </span>
                <span>{row.concept}</span>
              </div>
            );
          }
          if (row.type === "account") {
            return (
              <div
                style={{
                  paddingLeft: "72px",
                  cursor: "default",
                  color: "#6b7280",
                }}
              >
                {row.category}
              </div>
            );
          }
          // Fallback for concept (or other types)
          return (
            <div style={{ paddingLeft: "48px", cursor: "default" }}>
              {row.concept}
            </div>
          );
        },
      },
      {
        key: "amount",
        name: columnHeaders.amount,
        width: 150,
        renderCell: ({ row }) => {
          const amount = row.amount;
          const color =
            amount > 0 ? "#dc2626" : amount < 0 ? "#16a34a" : "#4b5563";
          return (
            <div style={{ textAlign: "right", color }}>
              {formatAmount(amount)} €
            </div>
          );
        },
      },
    ];

    // Ajouter les colonnes mensuelles
    monthColumns.forEach((monthKey) => {
      if (isBudgetMode) {
        // Mode Analyse : 4 colonnes par mois (Budget, Réel, Écart, %)
        // 1. Budget
        cols.push({
          key: `${monthKey}_budget`,
          name: `Budget ${formatMonthHeader(monthKey)}`,
          width: 120,
          renderCell: ({ row }) => {
            const amount = row[`${monthKey}_budget`] as number | undefined;
            if (amount === undefined || amount === 0) {
              return <div style={{ textAlign: "right", color: "#9ca3af" }}>-</div>;
            }
            return (
              <div style={{ textAlign: "right", color: "#6b7280" }}>
                {formatAmount(amount)} €
              </div>
            );
          },
        });

        // 2. Réel (Actual)
        cols.push({
          key: monthKey,
          name: `Réel`,
          width: 120,
          renderCell: ({ row }) => {
            const amount = row[monthKey] as number | undefined;
            if (amount === undefined || amount === 0) {
              return <div style={{ textAlign: "right" }}>-</div>;
            }
            // Pas de couleur spécifique ici, juste noir/défaut pour la lisibilité
            return (
              <div style={{ textAlign: "right", fontWeight: "500" }}>
                {formatAmount(amount)} €
              </div>
            );
          },
        });

        // 3. Écart (Variance) = Réel - Budget (Wait, usually for expenses: Budget - Actual is savings. But let's do simple diff first)
        // Convention : Positive green means good.
        // If Expense (Class 6): Budget - Actual > 0 => Green (Saved money).
        // If Income (Class 7): Actual - Budget > 0 => Green (Earned more).
        // Since we don't easily know Class 6 or 7 here without parsing account/category, let's stick to visual difference.
        // Standard financial reporting: Variance = Actual - Budget.
        // We will color based on sign, but the meaning depends on the account type.
        // To keep it simple: Green if Actual < Budget (assuming expenses context which is dominant).
        // Or better: Just show the Diff (Actual - Budget).
        cols.push({
          key: `${monthKey}_diff`,
          name: `Écart`,
          width: 120,
          renderCell: ({ row }) => {
            const actual = (row[monthKey] as number) || 0;
            const budget = (row[`${monthKey}_budget`] as number) || 0;
            const diff = actual - budget;
            
            if (diff === 0) return <div style={{ textAlign: "right", color: "#9ca3af" }}>-</div>;

            // Heuristic for color:
            // If it's likely income (Operating Income), positive diff is Good (Green).
            // If it's likely expense (Operating Expenses), positive diff (Over budget) is Bad (Red).
            // We can guess based on category name string.
            const isIncome = row.category.includes("Income") || row.category.includes("Produits");
            
            let color = "#4b5563"; // gray default

            // Logique de couleur inversée car les montants sont négatifs pour les revenus/dépenses selon le sens comptable
            // MAIS dans ce tableau, tout semble être présenté avec des signes comptables bruts (Dépenses > 0, Revenus < 0 ou inversement ?)
            // Vérifions la logique utilisateur : "quand le budget c'était -39 200 (Revenu espéré), mais que le réel c'est -35 704 (Revenu réel), on a fait moins qu'espéré => pas bien"
            // Donc ici : Réel (-35k) - Budget (-39k) = +3.5k. C'est mathématiquement positif, mais c'est "moins de revenu", donc Mauvais (Rouge).
            
            // Cas Revenus (Signes Négatifs en général dans le FEC pour les crédits/produits)
            // Pour l'affichage de l'écart des revenus, on veut que ce soit négatif si on a fait moins que prévu.
            // Actuellement : Réel (-35k) - Budget (-39k) = +3.5k. C'est "moins bien", on veut afficher -3.5k en rouge.
            // Donc pour les revenus, on inverse le signe de l'écart.
            if (isIncome) {
                // Diff réel = +3.5k. On veut afficher -3.5k.
                // Donc on prend -diff.
                // Si Diff > 0 => Rouge.
                color = diff > 0 ? "#dc2626" : "#16a34a";
                
                // Inverser le signe pour l'affichage si c'est un revenu
                // Comme ça : +3.5k (manque à gagner) devient -3.5k (perte vs budget)
                return (
                    <div style={{ textAlign: "right", color, fontWeight: "bold" }}>
                      {/* Si diff > 0 (manque à gagner), on affiche -X €. Si diff < 0 (gain), on affiche +X € */}
                      {diff > 0 ? "-" : "+"}{formatAmount(Math.abs(diff))} €
                    </div>
                  );
            } else {
                // Cas Dépenses (Signes Positifs généralement pour les débits/charges)
                color = diff > 0 ? "#dc2626" : "#16a34a";
                return (
                    <div style={{ textAlign: "right", color, fontWeight: "bold" }}>
                      {diff > 0 ? "+" : ""}{formatAmount(diff)} €
                    </div>
                  );
            }
          },
        });

        // 4. % (Percent)
        cols.push({
          key: `${monthKey}_pct`,
          name: `%`,
          width: 80,
          renderCell: ({ row }) => {
            const actual = (row[monthKey] as number) || 0;
            const budget = (row[`${monthKey}_budget`] as number) || 0;
            
            if (budget === 0) return <div style={{ textAlign: "right", color: "#9ca3af" }}>-</div>;
            
            // Calcul du pourcentage
            // Attention aux signes négatifs des revenus.
            // Si Budget = -100, Actual = -80. Pct = 80%. (On a fait 80% de l'objectif).
            // Si Budget = 100, Actual = 80. Pct = 80%. (On a consommé 80% du budget).
            const pct = Math.abs(actual / budget) * 100;
            
            let color = "#16a34a"; // Default Green

            // Logique de couleur pour le %
            if (row.category.includes("Income") || row.category.includes("Produits")) {
                // Revenus : On veut être > 100%
                if (pct < 80) color = "#dc2626"; // Rouge si < 80% de l'objectif
                else if (pct < 100) color = "#f97316"; // Orange si entre 80% et 100%
                else color = "#16a34a"; // Vert si > 100%
            } else {
                // Dépenses : On veut être < 100%
                if (pct > 100) color = "#dc2626"; // Rouge si dépassement
                else if (pct > 80) color = "#f97316"; // Orange si on approche de la limite (80-100%)
                else color = "#16a34a"; // Vert si on est large (< 80%)
            }

            return (
              <div style={{ textAlign: "right", color, fontSize: "0.9em", fontWeight: "bold" }}>
                {Math.round(pct)}%
              </div>
            );
          },
        });

      } else {
        // Mode Normal : 1 colonne par mois
        cols.push({
          key: monthKey,
          name: formatMonthHeader(monthKey),
          width: 120,
          renderCell: ({ row }) => {
            const amount = row[monthKey] as number | undefined;
            if (amount === undefined || amount === 0) {
              return <div style={{ textAlign: "right" }}>-</div>;
            }
            const color =
              amount > 0 ? "#dc2626" : amount < 0 ? "#16a34a" : "#4b5563";
            return (
              <div style={{ textAlign: "right", color }}>
                {formatAmount(amount)} €
              </div>
            );
          },
        });
      }
    });

    return cols;
  }, [
    columnHeaders,
    monthColumns,
    onCategoryToggle,
    onSubCategoryToggle,
    onConceptToggle,
    isBudgetMode, // Ajouter la dépendance
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#374151" }}>
                Mode Analyse (Budget vs Réel)
            </span>
            <button
                onClick={() => setIsBudgetMode(!isBudgetMode)}
                style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    color: isBudgetMode ? "#2563eb" : "#9ca3af",
                }}
            >
                {isBudgetMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
            </button>
        </div>
        <DataGrid
        className="rdg-auto-height"
        style={{ border: "1px solid #ddd" }}
        columns={columns}
        rows={flatRows}
        defaultColumnOptions={{
            resizable: true,
        }}
        rowHeight={35}
        headerRowHeight={35}
        />
    </div>
  );
}
