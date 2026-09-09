"use strict";
(self["webpackChunkcompass_web"] = self["webpackChunkcompass_web"] || []).push([["src_components_InboxPanel_tsx"],{

/***/ "./src/components/InboxPanel.tsx":
/*!***************************************!*\
  !*** ./src/components/InboxPanel.tsx ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   InboxPanel: () => (/* binding */ InboxPanel)
/* harmony export */ });
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-runtime */ "./node_modules/react/jsx-runtime.js");
/* harmony import */ var next_link__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/navigation */ "./design-plans/2026-09-08-compass-audit/fixture/next-stubs.tsx");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _components_ConsoleNav__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @/components/ConsoleNav */ "./src/components/ConsoleNav.tsx");
/* harmony import */ var _components_LoadingBlock__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! @/components/LoadingBlock */ "./src/components/LoadingBlock.tsx");
/* harmony import */ var _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @/lib/inbox-ui */ "./src/lib/inbox-ui.ts");
/* harmony import */ var _lib_inbox_classify__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! @/lib/inbox-classify */ "./src/lib/inbox-classify.ts");
/* harmony import */ var _lib_query_cache__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! @/lib/query-cache */ "./src/lib/query-cache.ts");
/* harmony import */ var _lib_task_organisation__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! @/lib/task-organisation */ "./src/lib/task-organisation.ts");
/* harmony import */ var _lib_use_cached_json__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! @/lib/use-cached-json */ "./src/lib/use-cached-json.ts");
/* harmony import */ var _components_UndoProvider__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! @/components/UndoProvider */ "./src/components/UndoProvider.tsx");
/* harmony import */ var _lib_utils__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! @/lib/utils */ "./src/lib/utils.ts");
'use client';













function replaceInboxUrl(params) {
    const url = `/inbox?${params.toString()}`;
    // Fresh state lets Next update useSearchParams without a server round-trip.
    window.history.replaceState(null, '', url);
}
const EMPTY_COPY = {
    agents: {
        title: 'No agent notifications',
        body: 'Blocked agent work and recent completions that still need review show up here.'
    },
    instantly: {
        title: 'No Instantly replies',
        body: 'Replies and positive Instantly interest will appear here as they come in.'
    },
    leads: {
        title: 'No open inbound leads',
        body: 'Website, guide, and Meta leads stay here until Contacted, Qualified, or Discarded.'
    }
};
function InboxEmptyIllustration() {
    return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("svg", { width: "64", height: "52", viewBox: "0 0 64 52", fill: "none", "aria-hidden": "true", className: "text-neutral-300", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("path", { d: "M8 18h48v26a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18Z", stroke: "currentColor", strokeWidth: "1.5" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("path", { d: "M8 18 32 34 56 18", stroke: "currentColor", strokeWidth: "1.5", strokeLinejoin: "round" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("path", { d: "M14 8h36l6 10H8l6-10Z", stroke: "currentColor", strokeWidth: "1.5", strokeLinejoin: "round" })] }));
}
function SourceGlyph({ tab }) {
    const label = tab === 'agents' ? 'A' : tab === 'instantly' ? 'I' : 'L';
    return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { "aria-hidden": true, className: (0,_lib_utils__WEBPACK_IMPORTED_MODULE_11__.cn)('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', tab === 'agents' && 'bg-amber-100 text-amber-800', tab === 'instantly' && 'bg-emerald-100 text-emerald-800', tab === 'leads' && 'bg-neutral-200 text-neutral-700'), children: label }));
}
function relatedTabLabels(item) {
    return [...new Set(item.related.map((r) => _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TAB_LABELS[r.tab]))];
}
function NotificationRow({ item, selected, onSelect }) {
    const alsoIn = relatedTabLabels(item);
    return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("button", { type: "button", id: `inbox-row-${item.id}`, onClick: onSelect, "aria-current": selected ? 'true' : undefined, className: (0,_lib_utils__WEBPACK_IMPORTED_MODULE_11__.cn)('flex w-full gap-3 border-b border-stone-100 px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e85d2a]/40', selected ? 'bg-[#e85d2a]/[0.06]' : 'hover:bg-stone-50/80', !item.unread && 'opacity-75'), children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(SourceGlyph, { tab: item.tab }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "min-w-0 flex-1", children: (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "flex items-start justify-between gap-2", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "min-w-0", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "truncate text-[13px] font-medium text-neutral-900", children: item.title }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "mt-0.5 line-clamp-2 text-[12px] leading-snug text-neutral-500", children: item.preview }), alsoIn.length > 0 ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "mt-1 text-[11px] text-neutral-400", children: ["Also in ", alsoIn.join(', ')] })) : null] }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "flex shrink-0 flex-col items-end gap-1 pt-0.5", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "text-[11px] tabular-nums text-neutral-400", children: (0,_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.formatInboxRelative)(item.occurredAt) }), item.unread ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, { children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "sr-only", children: "Unread" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "h-1.5 w-1.5 rounded-full bg-[#e85d2a]", "aria-hidden": true })] })) : ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "h-1.5 w-1.5 rounded-full border border-stone-300", "aria-hidden": true }))] })] }) })] }));
}
function ActionButton({ children, onClick, tone = 'neutral', disabled }) {
    return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("button", { type: "button", disabled: disabled, onClick: onClick, className: (0,_lib_utils__WEBPACK_IMPORTED_MODULE_11__.cn)('rounded-xl border px-2.5 py-1.5 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d2a]/40 disabled:opacity-50', tone === 'primary' &&
            'border-transparent bg-[var(--compass-accent)] text-white hover:bg-[var(--compass-accent-hover)]', tone === 'danger' && 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100', tone === 'neutral' && 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'), children: children }));
}
function ContextPane({ item, busy, suggestion, onTriage, onLifecycle, onCreateTask, onRefreshSuggest, onClassify }) {
    if (!item) {
        return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "flex h-full flex-col items-center justify-center gap-3 px-6 text-center", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(InboxEmptyIllustration, {}), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { className: "text-sm font-medium text-neutral-700", children: "Select a notification" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { className: "mt-1 max-w-sm text-sm text-neutral-500", children: "Context, triage actions, and a suggested next step show here." })] })] }));
    }
    return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "flex h-full min-h-0 flex-col", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "flex shrink-0 items-center justify-between gap-3 border-b border-stone-100 px-5 py-3.5", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "min-w-0", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "truncate text-[13px] text-neutral-500", children: [_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TAB_LABELS[item.tab], item.sourceLabel ? ` · ${item.sourceLabel}` : ''] }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h2", { className: "mt-0.5 truncate text-[15px] font-semibold tracking-tight text-neutral-900", children: item.title })] }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "flex shrink-0 flex-wrap items-center justify-end gap-2", children: [item.href ? (item.hrefExternal ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("a", { href: item.href, target: "_blank", rel: "noopener noreferrer", className: "compass-btn-secondary shrink-0 !px-2.5 !py-1.5 text-[12px]", children: ["Unibox", (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "sr-only", children: " (opens in a new tab)" })] })) : ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(next_link__WEBPACK_IMPORTED_MODULE_1__["default"], { href: item.href, className: "compass-btn-secondary shrink-0 !px-2.5 !py-1.5 text-[12px]", children: "Open" }))) : null, item.gmailHref ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("a", { href: item.gmailHref, target: "_blank", rel: "noopener noreferrer", className: "compass-btn-secondary shrink-0 !px-2.5 !py-1.5 text-[12px]", children: ["Gmail", (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "sr-only", children: " (opens in a new tab)" })] })) : null, item.crmHref ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(next_link__WEBPACK_IMPORTED_MODULE_1__["default"], { href: item.crmHref, className: "compass-btn-secondary shrink-0 !px-2.5 !py-1.5 text-[12px]", children: "CRM" })) : null] })] }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "min-h-0 flex-1 overflow-y-auto px-5 py-5", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h3", { className: "text-2xl font-semibold tracking-tight text-neutral-900", children: item.title }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { className: "mt-1 text-sm text-neutral-500", children: (0,_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.formatInboxWhen)(item.occurredAt) }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "mt-4 flex flex-wrap gap-2", children: [item.unread ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ActionButton, { disabled: busy, onClick: () => onTriage('read'), children: "Mark read" })) : ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ActionButton, { disabled: busy, onClick: () => onTriage('unread'), children: "Mark unread" })), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ActionButton, { disabled: busy, onClick: () => onTriage('snoozed'), children: "Snooze 24h" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ActionButton, { disabled: busy, tone: "primary", onClick: () => onTriage('done'), children: "Done" }), (item.tab === 'leads' || item.email) && ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ActionButton, { disabled: busy, onClick: onCreateTask, children: "Create task" }))] }), item.tab === 'instantly' ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "mt-3 flex flex-wrap gap-2", children: _lib_inbox_classify__WEBPACK_IMPORTED_MODULE_6__.INSTANTLY_CLASSIFY_ACTIONS.map((action) => ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ActionButton, { disabled: busy, onClick: () => onClassify(action.id), children: action.label }, action.id))) })) : null, item.tab === 'leads' ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "mt-3 flex flex-wrap gap-2", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ActionButton, { disabled: busy, onClick: () => onLifecycle('contacted'), children: "Contacted" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ActionButton, { disabled: busy, onClick: () => onLifecycle('qualified'), children: "Qualified" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ActionButton, { disabled: busy, tone: "danger", onClick: () => onLifecycle('discarded'), children: "Discard" })] })) : null, suggestion ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "mt-5 rounded-xl border border-neutral-200/80 bg-neutral-50/70 px-3 py-3", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "flex items-start justify-between gap-2", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("h4", { className: "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400", children: ["Suggested next step", suggestion.source === 'ai' ? ' · AI' : ''] }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("button", { type: "button", className: "text-[11px] text-neutral-500 underline-offset-2 hover:underline", onClick: onRefreshSuggest, children: "Refresh" })] }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { className: "mt-1 text-sm font-medium text-neutral-900", children: suggestion.nextStep }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { className: "mt-1 text-[12px] text-neutral-500", children: suggestion.rationale })] })) : null, item.related.length > 0 ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "mt-5", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h4", { className: "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400", children: "Same person" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("ul", { className: "mt-2 space-y-1", children: item.related.map((rel) => ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("li", { className: "text-sm text-neutral-700", children: (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)(next_link__WEBPACK_IMPORTED_MODULE_1__["default"], { href: `/inbox?tab=${rel.tab}&id=${encodeURIComponent(rel.itemId)}`, className: "underline-offset-2 hover:underline", children: [_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TAB_LABELS[rel.tab], " \u00B7 ", rel.title] }) }, rel.itemId))) })] })) : null, (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("dl", { className: "mt-6 grid gap-3 sm:grid-cols-2", children: [(item.contactName || item.email || item.phone) && ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "rounded-xl border border-neutral-200/80 bg-neutral-50/60 px-3 py-2.5 sm:col-span-2", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("dt", { className: "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400", children: "Contact" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("dd", { className: "mt-1 text-sm text-neutral-800", children: [item.contactName ? (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "font-medium", children: item.contactName }) : null, item.email ? (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "text-neutral-600", children: item.email }) : null, item.phone ? (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "text-neutral-500", children: item.phone }) : null] })] })), item.meta.map((row) => ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "min-w-0", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("dt", { className: "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400", children: row.label }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("dd", { className: "mt-1 truncate text-sm text-neutral-800", children: row.value })] }, `${row.label}-${row.value}`)))] }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "mt-8", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h4", { className: "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400", children: "Context" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800", children: item.body?.trim() || item.preview || 'No additional context.' })] })] })] }));
}
function mapInboxItems(items, update) {
    const next = [];
    for (const item of items) {
        const mapped = update(item);
        if (mapped)
            next.push(mapped);
    }
    return next;
}
/** Apply a triage/lifecycle change locally so the UI responds before the network round-trip. */
function applyOptimisticInboxUpdate(itemId, patch) {
    const existing = (0,_lib_query_cache__WEBPACK_IMPORTED_MODULE_7__.peekQueryCache)(_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_CACHE_KEY);
    if (!existing?.data)
        return;
    const data = existing.data;
    const channels = data.channels ?? {
        agents: data.tab === 'agents' ? data.items : [],
        instantly: data.tab === 'instantly' ? data.items : [],
        leads: data.tab === 'leads' ? data.items : []
    };
    const updateItem = (entry) => {
        if (entry.id !== itemId)
            return entry;
        if (patch.remove)
            return null;
        return {
            ...entry,
            triage: patch.triage,
            unread: patch.unread ?? (patch.triage === 'unread'),
            lifecycle: patch.lifecycle ?? entry.lifecycle,
            snoozedUntil: patch.triage === 'snoozed'
                ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                : patch.triage === 'done' || patch.triage === 'read' || patch.triage === 'unread'
                    ? null
                    : entry.snoozedUntil
        };
    };
    const agents = mapInboxItems(channels.agents, updateItem);
    const instantly = mapInboxItems(channels.instantly, updateItem);
    const leads = mapInboxItems(channels.leads, updateItem);
    const counts = (0,_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.countActionableBadge)({ agents, instantly, leads });
    const badgeTotal = counts.agents + counts.instantly + counts.leads;
    const needsYou = (0,_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.pickNeedsYou)([...agents, ...instantly, ...leads]);
    const activeTab = data.tab;
    const tabItems = activeTab === 'agents' ? agents : activeTab === 'instantly' ? instantly : leads;
    (0,_lib_query_cache__WEBPACK_IMPORTED_MODULE_7__.writeQueryCache)(_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_CACHE_KEY, {
        ...data,
        items: tabItems,
        total: tabItems.length,
        counts,
        badgeTotal,
        needsYou,
        channels: { agents, instantly, leads }
    });
}
function InboxPanel() {
    const router = (0,next_link__WEBPACK_IMPORTED_MODULE_1__.useRouter)();
    const pathname = (0,next_link__WEBPACK_IMPORTED_MODULE_1__.usePathname)();
    const viewPath = (0,_components_ConsoleNav__WEBPACK_IMPORTED_MODULE_3__.useConsoleViewPath)();
    const activeRoute = pathname === '/inbox' && viewPath === '/inbox';
    const searchParams = (0,next_link__WEBPACK_IMPORTED_MODULE_1__.useSearchParams)();
    const tab = (0,_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.parseInboxTab)(searchParams.get('tab'));
    const selectedParam = searchParams.get('id');
    const [mobileShowContext, setMobileShowContext] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(false);
    const backButton = (0,react__WEBPACK_IMPORTED_MODULE_2__.useRef)(null);
    const returnToList = (0,react__WEBPACK_IMPORTED_MODULE_2__.useRef)(false);
    (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
        if (!window.matchMedia('(max-width: 1023px)').matches)
            return;
        if (mobileShowContext)
            backButton.current?.focus();
        else if (returnToList.current) {
            document.getElementById(`inbox-row-${selectedParam}`)?.focus();
            returnToList.current = false;
        }
    }, [mobileShowContext, selectedParam]);
    const [suggestion, setSuggestion] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(null);
    const [busy, startTransition] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useTransition)();
    const [actionError, setActionError] = (0,react__WEBPACK_IMPORTED_MODULE_2__.useState)(null);
    const undo = (0,_components_UndoProvider__WEBPACK_IMPORTED_MODULE_10__.useUndo)();
    // One shared payload for all tabs — switching tabs is a local filter, not a refetch.
    const { data, error, loading, reload } = (0,_lib_use_cached_json__WEBPACK_IMPORTED_MODULE_9__.useCachedJson)(_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_CACHE_KEY, _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_CACHE_KEY);
    const items = (0,react__WEBPACK_IMPORTED_MODULE_2__.useMemo)(() => (0,_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.itemsForInboxTab)(data, tab), [data, tab]);
    const counts = data?.counts;
    const needsYou = data?.needsYou ?? [];
    const selectedId = (0,react__WEBPACK_IMPORTED_MODULE_2__.useMemo)(() => {
        if (selectedParam && items.some((item) => item.id === selectedParam))
            return selectedParam;
        return items[0]?.id ?? null;
    }, [items, selectedParam]);
    const selected = items.find((item) => item.id === selectedId) ?? null;
    (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
        if (!activeRoute || selectedParam || !items[0]?.id)
            return;
        const params = new URLSearchParams();
        params.set('tab', tab);
        params.set('id', items[0].id);
        replaceInboxUrl(params);
    }, [activeRoute, items, pathname, selectedParam, tab]);
    const loadSuggestion = (0,react__WEBPACK_IMPORTED_MODULE_2__.useCallback)(async (item, signal) => {
        setSuggestion(null);
        try {
            const res = await fetch('/api/inbox/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                signal,
                body: JSON.stringify({
                    tab: item.tab,
                    title: item.title,
                    preview: item.preview,
                    body: item.body,
                    email: item.email,
                    phone: item.phone,
                    agentStatus: item.agentStatus,
                    instantlyStatus: item.instantlyStatus,
                    lifecycle: item.lifecycle,
                    sourceLabel: item.sourceLabel
                })
            });
            if (signal?.aborted || !res.ok)
                return;
            const json = (await res.json());
            if (signal?.aborted)
                return;
            setSuggestion(json);
        }
        catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError')
                return;
            // Heuristic endpoint should rarely fail; ignore soft errors.
        }
    }, []);
    (0,react__WEBPACK_IMPORTED_MODULE_2__.useEffect)(() => {
        if (!activeRoute || !selected) {
            setSuggestion(null);
            return;
        }
        const controller = new AbortController();
        void loadSuggestion(selected, controller.signal);
        return () => controller.abort();
    }, [activeRoute, selected, loadSuggestion]);
    function setTab(next) {
        if (next === tab)
            return;
        const params = new URLSearchParams();
        params.set('tab', next);
        setMobileShowContext(false);
        // Transition keeps the previous list painted while the URL/selection updates.
        startTransition(() => {
            replaceInboxUrl(params);
        });
    }
    function selectItem(item) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', item.tab);
        params.set('id', item.id);
        setMobileShowContext(true);
        startTransition(() => {
            replaceInboxUrl(params);
        });
        if (item.unread) {
            void patchTriage(item, 'read', { silent: true });
        }
    }
    async function patchTriage(item, triage, opts) {
        setActionError(null);
        // Contacted/qualified stay in the leads queue; done/snooze/discard leave it.
        const shouldRemove = triage === 'done' ||
            triage === 'snoozed' ||
            opts?.lifecycle === 'discarded';
        applyOptimisticInboxUpdate(item.id, {
            triage,
            unread: triage === 'unread',
            lifecycle: opts?.lifecycle,
            remove: shouldRemove
        });
        const res = await fetch('/api/inbox/triage', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                channel: item.tab,
                sourceId: item.sourceId,
                triage,
                email: item.email,
                phone: item.phone,
                identityKey: item.identityKey,
                lifecycle: opts?.lifecycle
            })
        });
        if (!res.ok) {
            if (!opts?.silent)
                setActionError('Could not update triage');
            await reload(true);
            return false;
        }
        // Background reconcile — do not block the click path on a full refetch.
        void reload(false);
        return true;
    }
    function onTriage(triage) {
        if (!selected)
            return;
        startTransition(() => {
            void patchTriage(selected, triage);
        });
    }
    function onClassify(actionId) {
        if (!selected || selected.tab !== 'instantly')
            return;
        const action = (0,_lib_inbox_classify__WEBPACK_IMPORTED_MODULE_6__.classifyAction)(actionId);
        if (!action)
            return;
        startTransition(() => {
            void (async () => {
                setActionError(null);
                const statusRes = await fetch('/api/leads/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({
                        action: 'set_status',
                        ids: [selected.sourceId],
                        status: action.outboundStatus
                    })
                });
                if (!statusRes.ok) {
                    setActionError('Could not classify this reply');
                    return;
                }
                if (action.tag) {
                    const tagRes = await fetch('/api/leads/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                        body: JSON.stringify({
                            action: 'add_tag',
                            ids: [selected.sourceId],
                            tag: action.tag
                        })
                    });
                    if (!tagRes.ok) {
                        setActionError('Classified, but could not tag bad offer');
                    }
                }
                await patchTriage(selected, 'done');
                const leadId = selected.sourceId;
                const prevStatus = selected.instantlyStatus || 'replied';
                const tag = action.tag;
                const nextStatus = action.outboundStatus;
                undo.push({
                    label: 'Inbox classify',
                    undo: async () => {
                        await fetch('/api/leads/bulk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                            body: JSON.stringify({ action: 'set_status', ids: [leadId], status: prevStatus })
                        });
                        if (tag) {
                            await fetch('/api/leads/bulk', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                                body: JSON.stringify({ action: 'clear_tag', ids: [leadId], tag })
                            });
                        }
                    },
                    redo: async () => {
                        await fetch('/api/leads/bulk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                            body: JSON.stringify({ action: 'set_status', ids: [leadId], status: nextStatus })
                        });
                        if (tag) {
                            await fetch('/api/leads/bulk', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                                body: JSON.stringify({ action: 'add_tag', ids: [leadId], tag })
                            });
                        }
                    }
                });
            })();
        });
    }
    function onLifecycle(lifecycle) {
        if (!selected)
            return;
        const triage = lifecycle === 'discarded' ? 'done' : selected.unread ? 'read' : selected.triage;
        startTransition(() => {
            void patchTriage(selected, triage, { lifecycle });
        });
    }
    function onCreateTask() {
        if (!selected)
            return;
        startTransition(() => {
            void (async () => {
                setActionError(null);
                const title = selected.tab === 'leads'
                    ? `Follow up: ${selected.title}`
                    : selected.tab === 'instantly'
                        ? `Reply: ${selected.title}`
                        : selected.title;
                const notes = [
                    selected.email ? `Email: ${selected.email}` : null,
                    selected.phone ? `Phone: ${selected.phone}` : null,
                    selected.body || selected.preview,
                    `From Inbox (${selected.tab})`
                ]
                    .filter(Boolean)
                    .join('\n');
                const today = new Date();
                const dueToday = [
                    today.getFullYear(),
                    String(today.getMonth() + 1).padStart(2, '0'),
                    String(today.getDate()).padStart(2, '0')
                ].join('-');
                const fromSales = selected.tab === 'instantly' || selected.tab === 'leads';
                const res = await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({
                        title,
                        notes,
                        // Instantly opportunities land as high priority + due today so they
                        // show on Home Priorities and My Tasks Today/Focus together.
                        priority: selected.tab === 'instantly' ? 2 : 3,
                        due: fromSales ? dueToday : null,
                        task_type: fromSales ? 'SELL' : null,
                        source: 'inbox'
                    })
                });
                if (!res.ok) {
                    setActionError('Could not create task');
                    return;
                }
                const created = (await res.json().catch(() => null));
                await patchTriage(selected, 'read');
                router.push((0,_lib_task_organisation__WEBPACK_IMPORTED_MODULE_8__.tasksHref)({
                    window: fromSales ? 'today' : 'focus',
                    taskId: created?.id ?? null
                }));
            })();
        });
    }
    if (error && !data) {
        return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "flex flex-1 items-center justify-center p-6", children: (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700", children: [error, ' ', (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("button", { type: "button", className: "underline", onClick: () => void reload(true), children: "Retry inbox" })] }) }));
    }
    // Only blank the panel on the very first load — tab switches never hit this gate.
    if (loading || !data) {
        return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "flex flex-1 p-3 sm:p-4", children: (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(_components_LoadingBlock__WEBPACK_IMPORTED_MODULE_4__.LoadingBlock, { label: "Loading inbox\u2026" }) }));
    }
    const empty = EMPTY_COPY[tab];
    return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "flex min-h-0 flex-1 flex-col p-3 sm:p-4", children: (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "compass-panel flex min-h-0 flex-1 flex-col overflow-hidden text-neutral-900", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("header", { className: "flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "min-w-0", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("h1", { className: "compass-page-title-compact", children: "Inbox" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { className: "truncate text-[12px] text-neutral-500", children: _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TAB_HINTS[tab] })] }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "shrink-0 rounded-xl bg-stone-50 px-2 py-1 text-[12px] tabular-nums text-neutral-500 ring-1 ring-stone-200/70", children: [data.badgeTotal, " need", data.badgeTotal === 1 ? 's' : '', " you \u00B7 ", items.length, " shown"] })] }), needsYou.length > 0 ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "shrink-0 border-b border-stone-100 bg-stone-50/60 px-3 py-2.5", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "compass-section-label mb-1.5", children: "Needs you" }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "flex gap-2 overflow-x-auto pb-0.5", children: needsYou.map((item) => ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("button", { type: "button", onClick: () => selectItem(item), className: (0,_lib_utils__WEBPACK_IMPORTED_MODULE_11__.cn)('inline-flex max-w-[220px] shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d2a]/40', item.id === selectedId
                                    ? 'border-[#e85d2a]/40 bg-[#e85d2a]/10 shadow-soft'
                                    : 'border-stone-200 bg-white text-neutral-800 hover:border-stone-300'), children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(SourceGlyph, { tab: item.tab }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("span", { className: "min-w-0", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: "block truncate text-[12px] font-medium text-neutral-900", children: item.title }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("span", { className: "block truncate text-[11px] text-neutral-500", children: [_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TAB_LABELS[item.tab], " \u00B7 ", (0,_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.formatInboxRelative)(item.occurredAt)] })] })] }, `needs-${item.id}`))) })] })) : null, (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { role: "tablist", "aria-label": "Inbox channels", className: "mx-3 mt-2 flex shrink-0 gap-0.5 overflow-x-auto rounded-xl border border-stone-200/80 bg-stone-50/80 p-0.5 shadow-soft", children: _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TABS.map((key) => {
                        const count = counts?.[key] ?? 0;
                        const active = tab === key;
                        return ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("button", { type: "button", role: "tab", id: `inbox-tab-${key}`, "aria-selected": active, "aria-controls": `inbox-panel-${key}`, tabIndex: active ? 0 : -1, onKeyDown: (event) => {
                                const index = _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TABS.indexOf(key);
                                const nextIndex = event.key === 'ArrowRight' ? (index + 1) % _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TABS.length
                                    : event.key === 'ArrowLeft' ? (index + _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TABS.length - 1) % _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TABS.length
                                        : event.key === 'Home' ? 0 : event.key === 'End' ? _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TABS.length - 1 : null;
                                if (nextIndex === null)
                                    return;
                                event.preventDefault();
                                const next = _lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TABS[nextIndex];
                                setTab(next);
                                document.getElementById(`inbox-tab-${next}`)?.focus();
                            }, onClick: () => setTab(key), className: (0,_lib_utils__WEBPACK_IMPORTED_MODULE_11__.cn)('compass-seg-btn inline-flex shrink-0 items-center gap-1.5', active && 'compass-seg-btn-active'), children: [_lib_inbox_ui__WEBPACK_IMPORTED_MODULE_5__.INBOX_TAB_LABELS[key], (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("span", { className: (0,_lib_utils__WEBPACK_IMPORTED_MODULE_11__.cn)('rounded-md px-1 text-[11px] tabular-nums', active ? 'bg-[#e85d2a]/10 text-[#c2410c]' : 'bg-stone-100 text-neutral-500'), children: count })] }, key));
                    }) }), actionError ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-800", children: actionError })) : null, (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { role: "tabpanel", id: `inbox-panel-${tab}`, "aria-labelledby": `inbox-tab-${tab}`, className: "flex min-h-0 flex-1", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("section", { className: (0,_lib_utils__WEBPACK_IMPORTED_MODULE_11__.cn)('flex min-h-0 w-full shrink-0 flex-col border-neutral-200/80 lg:w-[340px] lg:border-r xl:w-[380px]', mobileShowContext ? 'hidden lg:flex' : 'flex'), children: (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("div", { className: "min-h-0 flex-1 overflow-y-auto", children: items.length === 0 ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center", children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(InboxEmptyIllustration, {}), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { children: [(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { className: "text-sm font-medium text-neutral-700", children: empty.title }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("p", { className: "mt-1 max-w-xs text-sm text-neutral-500", children: empty.body })] })] })) : (items.map((item) => ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(NotificationRow, { item: item, selected: item.id === selectedId, onSelect: () => selectItem(item) }, item.id)))) }) }), (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("section", { className: (0,_lib_utils__WEBPACK_IMPORTED_MODULE_11__.cn)('min-h-0 min-w-0 flex-1 bg-white', mobileShowContext ? 'flex' : 'hidden lg:flex'), children: (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)("div", { className: "flex min-h-0 w-full flex-col", children: [mobileShowContext ? ((0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)("button", { type: "button", ref: backButton, className: "border-b border-neutral-200 px-4 py-2 text-left text-[13px] text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c2410c] lg:hidden", onClick: () => {
                                            returnToList.current = true;
                                            setMobileShowContext(false);
                                        }, children: "\u2190 Back to inbox" })) : null, (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(ContextPane, { item: items.length === 0 ? null : selected, busy: busy, suggestion: suggestion, onTriage: onTriage, onLifecycle: onLifecycle, onCreateTask: onCreateTask, onClassify: onClassify, onRefreshSuggest: () => {
                                            if (selected)
                                                void loadSuggestion(selected);
                                        } })] }) })] })] }) }));
}


/***/ }),

/***/ "./src/lib/inbox-classify.ts":
/*!***********************************!*\
  !*** ./src/lib/inbox-classify.ts ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CLASSIFY_OUTBOUND_STATUSES: () => (/* binding */ CLASSIFY_OUTBOUND_STATUSES),
/* harmony export */   INSTANTLY_CLASSIFY_ACTIONS: () => (/* binding */ INSTANTLY_CLASSIFY_ACTIONS),
/* harmony export */   classifyAction: () => (/* binding */ classifyAction),
/* harmony export */   isClassifyOutboundStatus: () => (/* binding */ isClassifyOutboundStatus)
/* harmony export */ });
const INSTANTLY_CLASSIFY_ACTIONS = [
    { id: 'positive', label: 'Positive', outboundStatus: 'interested', tag: null },
    { id: 'not_now', label: 'Not now', outboundStatus: 'not_interested', tag: null },
    { id: 'wrong_person', label: 'Wrong person', outboundStatus: 'wrong_person', tag: null },
    { id: 'bad_offer', label: 'Bad offer', outboundStatus: 'not_interested', tag: 'bad_offer' },
    { id: 'ooo', label: 'OOO', outboundStatus: 'out_of_office', tag: null }
];
const CLASSIFY_OUTBOUND_STATUSES = [
    'interested',
    'not_interested',
    'wrong_person',
    'out_of_office',
    'meeting_booked',
    'replied',
    'suppressed',
    'uncontacted',
    'contacted',
    'booked',
    'converted'
];
function classifyAction(id) {
    return INSTANTLY_CLASSIFY_ACTIONS.find((row) => row.id === id) ?? null;
}
function isClassifyOutboundStatus(value) {
    return CLASSIFY_OUTBOUND_STATUSES.includes(value);
}


/***/ })

}]);