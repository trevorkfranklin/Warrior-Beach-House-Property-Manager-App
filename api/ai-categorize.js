export const config = { runtime: 'edge' };

const CATEGORIES = [
  'Advertising', 'Cash Flow Support', 'Cleaning / Housekeeping', 'HOA Fees',
  'Insurance', 'Internet / Cable', 'Landscaping', 'Linens & Supplies',
  'Management Fees', 'Mortgage', 'Other Expense', 'Other Income',
  'Professional Services', 'Property Tax', 'Rental Income',
  'Repairs & Maintenance', 'Utilities',
];

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return new Response('OpenRouter API key not configured', { status: 500 });

  const { uncategorized, examples, owners } = await req.json();

  const ownerLines = (owners || []).map(o => `  id="${o.id}" name="${o.name}"`).join('\n');
  const catList    = CATEGORIES.join(', ');

  const exampleLines = (examples || []).slice(0, 50).map(tx => {
    let extra = '';
    if (tx.category === 'Cash Flow Support' && tx.ownerId) {
      const o = (owners || []).find(o => o.id === tx.ownerId);
      if (o) extra += ` owner="${o.name}"`;
    }
    if (tx.category === 'Property Tax' && tx.taxYear) {
      extra += ` taxYear=${tx.taxYear}${tx.taxType ? ` taxType=${tx.taxType}` : ''}`;
    }
    return `  ${tx.date} | ${tx.type} | $${tx.amount} | "${tx.description}" → ${tx.category}${extra}`;
  }).join('\n');

  const uncatLines = uncategorized.map(tx =>
    `  id="${tx.id}" date=${tx.date} type=${tx.type} amount=$${tx.amount} desc="${tx.description}"${tx.notes ? ` notes="${tx.notes}"` : ''}`
  ).join('\n');

  const system = `You are a bookkeeper for Warrior Beach House, a short-term vacation rental at 18611 Warrior Rd, Galveston, TX 77554, managed by Vacasa.

CATEGORIES: ${catList}

OWNERS:
${ownerLines || '  (none)'}

RULES:
- Rental Income (Income): Vacasa payouts, Airbnb/VRBO/STR platform payouts, net rent received.
- Management Fees (Expense): Vacasa management fee deductions, platform commissions.
- Cleaning / Housekeeping: cleaning service payments, housekeeping charges.
- Cash Flow Support (Income or Expense): cash contributions from owners to cover expenses. Set ownerId if description matches an owner name.
- Property Tax (Expense): county or MUD tax payments. Set taxYear (year of the bill) and taxType "County" or "MUD" from description clues.
- Mortgage (Expense): monthly mortgage/loan payments.
- HOA Fees (Expense): HOA dues or assessments.
- Insurance (Expense): homeowners, windstorm, flood, or liability insurance premiums.
- Repairs & Maintenance (Expense): contractors, plumbers, handymen, repair supplies, Home Depot, hardware stores.
- Utilities (Expense): electric (CenterPoint, Reliant), water, gas, trash.
- Internet / Cable (Expense): Spectrum, AT&T, internet, cable TV.
- Landscaping (Expense): lawn care, landscaping, yard maintenance.
- Linens & Supplies (Expense): towels, bedding, toiletries, guest supplies, Amazon supply orders.
- Advertising (Expense): listing fees, marketing, photography.
- Professional Services (Expense): legal, accounting, inspections.
- Other Income / Other Expense: use sparingly for truly unclassifiable items.
- confidence: "high" = very clear match, "medium" = likely, "low" = uncertain guess.

CATEGORIZED EXAMPLES (learn from these patterns):
${exampleLines || '  (no examples yet — use best judgment)'}

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "suggestions": [
    {
      "id": "transaction-id",
      "category": "Category Name",
      "ownerId": null,
      "taxYear": null,
      "taxType": null,
      "confidence": "high"
    }
  ]
}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://warrior-beach-house.vercel.app',
      'X-Title': 'Warrior Beach House Property Manager',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-v4-flash',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Categorize these ${uncategorized.length} transactions:\n${uncatLines}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(err, { status: res.status });
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{"suggestions":[]}';
  return new Response(content, { status: 200, headers: { 'Content-Type': 'application/json' } });
}
