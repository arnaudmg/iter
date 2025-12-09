import { NextRequest, NextResponse } from "next/server";

interface Transaction {
  date: string;
  // Add other transaction properties here as needed
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
  let filterDateEnd;

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
    const allItems: Transaction[] = [];
    let hasMore = true;
    let cursor: string | null = null;
    let page = 1;

    while (hasMore) {
      const params = new URLSearchParams({
        "q[date_gteq]": filterDateStart,
        "order[date]": "desc",
        limit: "100",
      });

      if (filterDateEnd) {
        params.append("q[date_lteq]", filterDateEnd);
      }

      if (cursor) {
        params.append("cursor", cursor);
      }

      const url = `https://app.pennylane.com/api/external/v2/transactions?${params.toString()}`;
      console.log(`Fetching page ${page} from URL:`, url);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `API error: ${response.status} ${response.statusText}`,
          errorBody
        );
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of data.items) {
        // Dates are strings, so we need to compare them properly
        if (item.date >= filterDateStart) {
          allItems.push(item);
        } else {
          // This transaction is too old, and since they are sorted,
          // all subsequent ones will be too.
          hasMore = false;
          break;
        }
      }

      if (hasMore) {
        hasMore = data.has_more;
        cursor = data.next_cursor;
      }

      page++;
    }

    console.log(`Total transactions fetched: ${allItems.length}`);
    return NextResponse.json({ items: allItems });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
