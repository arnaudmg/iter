import { NextRequest, NextResponse } from "next/server";

interface Invoice {
  id: string;
  date: string;
  amount: string;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.PENNYLANE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  let filterDateStart;
  let filterDateEnd: string | null = null;

  if (startDate) {
    filterDateStart = startDate;
  } else {
    const today = new Date();
    const fifteenDaysAgo = new Date(today);
    fifteenDaysAgo.setDate(today.getDate() - 14);
    filterDateStart = fifteenDaysAgo.toISOString().split("T")[0];
  }

  if (endDate) {
    filterDateEnd = endDate;
  }

  try {
    let accountReceivable = 0;
    const allInvoices: Invoice[] = [];
    let hasMore = true;
    let cursor: string | null = null;
    let page = 1;

    while (hasMore) {
      const params = new URLSearchParams({
        limit: "100",
        "order[date]": "desc",
      });

      if (cursor) {
        params.append("cursor", cursor);
      }

      const url = `https://app.pennylane.com/api/external/v2/customer_invoices?${params.toString()}`;
      console.log(`Fetching customer invoices page ${page} from URL:`, url);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `API error fetching customer invoices: ${response.status} ${response.statusText}`,
          errorBody
        );
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        hasMore = false;
        break;
      }

      for (const invoice of data.items) {
        if (invoice.date < filterDateStart) {
          hasMore = false;
          break;
        }
        allInvoices.push(invoice);
      }

      if (hasMore) {
        hasMore = data.has_more;
        cursor = data.next_cursor;
      }
      page++;
    }

    const filteredInvoices = allInvoices.filter((invoice) => {
      const invoiceDate = new Date(invoice.date);
      const startDate = new Date(filterDateStart);
      const endDateValue = filterDateEnd ? new Date(filterDateEnd) : new Date();
      return invoiceDate >= startDate && invoiceDate <= endDateValue;
    });

    for (const invoice of filteredInvoices) {
      const matchedTransactionsUrl = `https://app.pennylane.com/api/external/v2/customer_invoices/${invoice.id}/matched_transactions`;
      const matchedTransactionsResponse = await fetch(matchedTransactionsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!matchedTransactionsResponse.ok) {
        console.error(
          `Failed to fetch matched transactions for invoice ${invoice.id}`
        );
        continue;
      }

      const matchedTransactionsData = await matchedTransactionsResponse.json();
      if (
        matchedTransactionsData.items &&
        matchedTransactionsData.items.length === 0
      ) {
        accountReceivable += parseFloat(invoice.amount);
      }
    }

    console.log(`Total customer invoices fetched: ${allInvoices.length}`);
    console.log(`Account Receivable: ${accountReceivable}`);

    return NextResponse.json({
      accountReceivable: accountReceivable,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}
