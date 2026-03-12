const { categorize } = require("./finance");

function extractDateFromText(text) {
  const lower = text.toLowerCase();
  const now = new Date();
  if (lower.includes("today")) return now;
  if (lower.includes("yesterday")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (lower.includes("tomorrow")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }

  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    const d = new Date(
      `${year}-${String(slashMatch[1]).padStart(2, "0")}-${String(slashMatch[2]).padStart(2, "0")}T00:00:00`
    );
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}

function extractAmountFromText(text) {
  const cleaned = text.replace(/,/g, " ");
  const amountMatch = cleaned.match(/(-?\d+(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;
  return Number(amountMatch[1]);
}

function inferDirection(text) {
  const lower = text.toLowerCase();
  if (/(earned|earn|income|got paid|got|received|salary|paycheck|deposit|refund|reimbursed)/.test(lower)) {
    return "income";
  }
  if (/(spent|paid|charged|bought|purchase|debit|lost|fee|bill)/.test(lower)) return "expense";
  return "expense";
}

function buildDescriptionFromText(text) {
  const cleaned = text
    .replace(/\b(today|yesterday|tomorrow)\b/gi, "")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "")
    .replace(/\b\d+(?:\.\d{1,2})?\b/g, "")
    .replace(/\b(usd|eur|euro|dollars?|bucks?)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) return "NLP entry";
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

function parseTransactionText(text) {
  const amountRaw = extractAmountFromText(text);
  if (!Number.isFinite(amountRaw)) return null;
  const direction = amountRaw < 0 ? "expense" : inferDirection(text);
  const amount = direction === "income" ? Math.abs(amountRaw) : -Math.abs(amountRaw);
  const date = extractDateFromText(text) || new Date();
  const description = buildDescriptionFromText(text);
  const category = categorize(description, amount);
  return {
    description,
    amount,
    date: date.toISOString().slice(0, 10),
    category,
  };
}

module.exports = { parseTransactionText };
