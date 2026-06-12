import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, User, Trash2, Key, X } from 'lucide-react';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
import { useProperty } from '../hooks/useProperty';
import { useTransactions } from '../hooks/useTransactions';
import { useReservations } from '../hooks/useReservations';
import { usePropertyTaxes } from '../hooks/usePropertyTaxes';
import { useHoaDues } from '../hooks/useHoaDues';
import { useAppSetting } from '../hooks/useAppSetting';


const SUGGESTED = [
  'What is my total revenue from reservations this year?',
  'What is my occupancy rate for this year?',
  'Summarize my income and expenses for this year',
  'What STR tax deductions should I be aware of in Texas?',
  'Give me a cashflow forecast for the next 6 months',
];

function buildContext(property, reservations, transactions, taxes, hoa) {
  const fmtM = (n) => n ? `$${Number(n).toLocaleString()}` : '—';
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  // Property summary
  const propLine = `18611 Warrior Rd, Galveston, TX 77554 | ${property.bedrooms || '?'}bd/${property.bathrooms || '?'}ba | ${property.sqft ? property.sqft.toLocaleString() + ' sqft' : '?'} | Purchase price: ${fmtM(property.purchasePrice)}`;

  // Reservations
  const resLines = reservations.map(r => {
    const nights = r.nights || 0;
    const status = r.checkOut < today ? 'Complete' : r.checkIn <= today ? 'Active' : 'Upcoming';
    return `  • ${r.guestName} | ${r.checkIn} – ${r.checkOut} | ${nights} nights | Gross: ${fmtM(r.grossRent)} | Net: ${fmtM(r.netRent)} | ${status}`;
  }).join('\n');


  // YTD financials
  const yearTx = transactions.filter(t => !t.excluded && t.date.startsWith(String(currentYear)));
  const income          = yearTx.filter(t => t.type === 'Income'  && t.category !== 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);
  const expenses        = yearTx.filter(t => t.type === 'Expense' && t.category !== 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);
  const cashFlowSupport = yearTx.filter(t => t.category === 'Cash Flow Support').reduce((s, t) => s + Number(t.amount), 0);

  // Category breakdown
  const byCategory = {};
  for (const t of yearTx) {
    byCategory[t.category || 'Uncategorized'] = (byCategory[t.category || 'Uncategorized'] || 0) + Number(t.amount);
  }
  const catLines = Object.entries(byCategory).map(([c, v]) => `  ${c}: ${fmtM(v)}`).join('\n');

  // Recent transactions
  const recentTx = [...transactions].filter(t => !t.excluded).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)
    .map(t => `  • ${t.date} | ${t.type} | ${t.category || 'Uncategorized'} | ${fmtM(t.amount)} | ${t.description}`).join('\n');

  // Property taxes
  const taxLines = taxes.filter(t => t.annualAmount).map(t => `  • ${t.taxYear}${t.taxType ? ` ${t.taxType}` : ''} | ${fmtM(t.annualAmount)} due ${t.dueDate || 'unknown'}`).join('\n');

  // HOA dues
  const hoaLines = hoa.filter(h => h.annualAmount).map(h => `  • ${h.year} | ${fmtM(h.annualAmount)} due ${h.dueDate || 'unknown'}`).join('\n');

  // Occupancy stats
  const totalNights  = reservations.filter(r => r.status !== 'Cancelled').reduce((s, r) => s + (r.nights || 0), 0);
  const totalGross   = reservations.filter(r => r.status !== 'Cancelled').reduce((s, r) => s + Number(r.grossRent || 0), 0);
  const totalRevenue = reservations.filter(r => r.status !== 'Cancelled').reduce((s, r) => s + Number(r.netRent || 0), 0);

  return `# Warrior Beach House — Finance Data (as of ${today})

## Property
${propLine}

## Reservations (${reservations.length} total)
${resLines || '  None'}

### Occupancy Summary
  Total nights booked: ${totalNights}
  Total gross rent: ${fmtM(totalGross)}
  Management fees (23%): ${fmtM(Math.round(totalGross * 0.23))}
  Total net rent (owner): ${fmtM(totalRevenue)}
  Net ADR (net rent ÷ nights): ${totalNights > 0 ? fmtM(Math.round(totalRevenue / totalNights)) : '—'}

## ${currentYear} Financials (YTD)
  Total Income:         ${fmtM(income)}
  Total Expenses:       ${fmtM(expenses)}
  Net Cashflow:         ${fmtM(income - expenses)}${cashFlowSupport > 0 ? `\n  Cash Flow Support:    ${fmtM(cashFlowSupport)} (owner contributions — excluded from income/expense)` : ''}

### Category Breakdown
${catLines || '  None'}

## Recent Transactions (last 15)
${recentTx || '  None'}

## Property Taxes
${taxLines || '  None'}

## HOA Dues
${hoaLines || '  None'}`;
}

export default function Chat() {
  const { property }          = useProperty();
  const { reservations }      = useReservations();
  const { transactions }      = useTransactions();
  const { propertyTaxes: taxes } = usePropertyTaxes();
  const { hoaDues: hoa }      = useHoaDues();

  const [apiKey, setApiKey]   = useAppSetting('openrouter_key', '');
  const [showKey, setShowKey]   = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [model, setModel]       = useAppSetting('vision_model', 'deepseek/deepseek-v4-flash');
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const context = useMemo(() => buildContext(property, reservations, transactions, taxes, hoa),
    [property, reservations, transactions, taxes, hoa]);

  const systemPrompt = `You are an expert short-term vacation rental advisor and financial assistant for Warrior Beach House at 18611 Warrior Rd, Galveston, TX 77554. You have deep knowledge of:
- Short-term rental (STR) business metrics: occupancy rate, ADR, RevPAR, revenue management
- Galveston/Texas STR market trends and seasonal patterns
- STR tax implications in Texas (hotel occupancy tax, income tax deductions, depreciation)
- Airbnb and VRBO platform strategies and best practices
- Vacation rental property management, maintenance, and guest experience
- Real estate investment analysis for vacation properties

You have real-time access to the following live property data. Use it to give specific, accurate answers.

${context}

Guidelines:
- Reference specific dollar amounts, dates, and guest names from the data above when relevant
- Format currency clearly (e.g., $1,250/night, $425,000)
- Be concise but thorough
- If asked about something not in the data, draw on your general STR and vacation rental expertise
- Proactively flag issues you notice (upcoming reservations, unpaid taxes, slow seasons, etc.)
- Texas has a state hotel occupancy tax (6%) plus local Galveston taxes — mention this when relevant`;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput(''); setError('');
    const newMessages = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);
    setLoading(true);

    try {
      if (!apiKey) throw new Error('OpenRouter API key not set. Click the key icon in the header to add it.');
      const res = await fetch(OR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://warrior-beach-house.local',
          'X-Title': 'Warrior Beach House',
        },
        body: JSON.stringify({
          model, stream: true, max_tokens: 2048,
          messages: [
            { role: 'system', content: systemPrompt },
            ...newMessages.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      if (!res.ok) { const err = await res.text(); throw new Error(`API error ${res.status}: ${err}`); }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            assistantText += delta;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: assistantText };
              return updated;
            });
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setError(e.message);
      setMessages(prev => prev.slice(0, -1));
    } finally { setLoading(false); inputRef.current?.focus(); }
  };

  const clearChat = () => { setMessages([]); setError(''); };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 lg:px-8 py-5 border-b border-navy-700 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Assistant</h1>
          <p className="text-slate-400 text-sm mt-0.5">Ask anything about your beach house finances or STR strategy</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="model-id (e.g. meta-llama/llama-3.1-8b-instruct:free)"
            className="bg-navy-800 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white w-full sm:w-80 placeholder-slate-600"
          />
          <button
            onClick={() => { setShowKey(v => !v); setKeyDraft(apiKey); }}
            title={apiKey ? 'API key configured — click to change' : 'Set OpenRouter API key'}
            className={`p-1.5 rounded-lg transition-colors ${apiKey ? 'text-emerald-400 hover:text-emerald-300' : 'text-yellow-400 hover:text-yellow-300 animate-pulse'}`}
          >
            <Key size={16} />
          </button>
          {messages.length > 0 && <button onClick={clearChat} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm"><Trash2 size={14} /> Clear</button>}
        </div>
      </div>

      {showKey && (
        <div className="px-4 sm:px-6 lg:px-8 py-3 border-b border-navy-700 bg-navy-800/50 flex items-center gap-3 flex-wrap flex-shrink-0">
          <Key size={14} className="text-slate-400 flex-shrink-0" />
          <input
            type="password"
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setApiKey(keyDraft); setShowKey(false); } }}
            placeholder="sk-or-... — get a free key at openrouter.ai/keys"
            className="flex-1 min-w-0 bg-navy-900 border border-navy-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            autoFocus
          />
          <button onClick={() => { setApiKey(keyDraft); setShowKey(false); }} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium">Save</button>
          <button onClick={() => setShowKey(false)} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
        </div>
      )}

      {!apiKey && !showKey && (
        <div className="px-4 sm:px-6 lg:px-8 py-2.5 bg-yellow-500/10 border-b border-yellow-500/20 flex-shrink-0">
          <p className="text-yellow-400 text-xs">OpenRouter API key required. <button onClick={() => { setShowKey(true); setKeyDraft(''); }} className="underline hover:text-yellow-300">Click the key icon</button> to add it — free at <span className="font-mono">openrouter.ai/keys</span></p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-center mb-8">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center">
                <Bot size={28} className="text-emerald-400" />
              </div>
            </div>
            <p className="text-center text-slate-400 text-sm mb-8">
              I have full access to your beach house data. Ask me about reservations, finances, STR strategy, or Galveston market insights.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SUGGESTED.map(s => (
                <button key={s} onClick={() => send(s)} className="text-left text-sm text-slate-400 hover:text-white bg-navy-800 hover:bg-navy-700 border border-navy-700 rounded-xl px-4 py-3 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'} max-w-5xl ${m.role === 'user' ? 'ml-auto' : 'mr-auto'}`}>
            {m.role === 'assistant' && <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"><Bot size={16} className="text-emerald-400" /></div>}
            <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-w-[85%] sm:max-w-md lg:max-w-3xl ${m.role === 'user' ? 'bg-emerald-500/20 text-white rounded-tr-sm' : 'bg-navy-800 border border-navy-700 text-slate-200 rounded-tl-sm'}`}>
              {m.content || <span className="text-slate-500 animate-pulse">▍</span>}
            </div>
            {m.role === 'user' && <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"><User size={16} className="text-blue-400" /></div>}
          </div>
        ))}

        {loading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3 max-w-5xl mr-auto">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0"><Bot size={16} className="text-emerald-400" /></div>
            <div className="bg-navy-800 border border-navy-700 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && <div className="max-w-5xl mx-auto bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 sm:px-6 py-5 border-t border-navy-700 flex-shrink-0">
        <div className="flex gap-3">
          <textarea
            ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about reservations, finances, STR strategy…  (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 min-w-0 bg-navy-800 border border-navy-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-emerald-500"
            style={{ minHeight: 48, maxHeight: 160 }}
          />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="w-12 h-12 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
            <Send size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-600 text-center mt-2">{model ? `Using ${model} via OpenRouter` : 'Enter a model ID above to get started'}</p>
      </div>
    </div>
  );
}
