# Compass / Folio compatibility

The former cream-and-orange editorial direction and the later Linear-neutral palette were superseded by Jules on 16 September 2026. The current operator design contract is [WORKSPACE.md](WORKSPACE.md), using Firecrawl's light palette while retaining the compact Linear-like workspace geometry, Notion-style writing and Attio-style CRM and Reports.

`folio.css` and `components/folio/` retain their names so existing operator surfaces keep their established imports and behaviour. They now participate in the shared workspace system; the historical Folio name does not imply serif headings or cream pages. The current Firecrawl-inspired palette is the default; set `data-palette="linear"` on `.folio-shell` to restore the previous neutral option.
