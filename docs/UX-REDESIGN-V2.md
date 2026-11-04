# Emoteca UX 2.0 — Cinema-first redesign (documento storico)

> **Documento storico, non è lo stato finale del prodotto.** Emoteca **v3** ha aggiunto un catalogo globale e una **pagina film dedicata** al posto del popup; alcuni flussi, menu e diagrammi descritti qui sono superati. Per riprendere il lavoro usa [PROJECT-HANDOFF.md](PROJECT-HANDOFF.md), [CATALOG-V3.md](CATALOG-V3.md) e il codice `main`. Il deploy effettivo Coolify non è confermato.

## Decisione

Emoteca è una biblioteca cinematografica personale, **non** un gestionale SaaS o un pannello analytics. L'esperienza deve mostrare prima le opere e poi i controlli: il prodotto serve a trovare una storia e a conservare il ricordo della propria visione.

Il precedente layout con sidebar, hero pubblicitaria, quattro statistiche e badge di affinità ripetuti era troppo simile a una dashboard generica. La v2 elimina quella struttura, non si limita a cambiarne i colori.

## Design brief

- **Pubblico**: persona che usa Emoteca per esplorare, ritrovare, valutare e catalogare film e serie.
- **Compito principale**: passare da una collezione di titoli a uno specifico film, aprirne la scheda, segnarlo come visto e salvarne una nota.
- **Compito secondario**: cercare un nuovo film in Wikidata / TMDB e inserirlo nella libreria privata senza duplicarlo.
- **Identità**: archivio cinematografico contemporaneo; la locandina è l'elemento visuale più importante.
- **Constraint**: HTML/CSS/JS statici, IndexedDB esistente, nessun framework runtime, nessuna migrazione dati.

## IA e wireframe

### Desktop

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ EMOTECA.     In evidenza  Libreria  Da guardare  Visti  Preferiti  Cerca │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  DAL TUO ARCHIVIO     ┌───────────────────────────┐                      │
│  Film / 2011          │                           │                      │
│  WARRIOR              │       Locandina vera       │                      │
│  Sinossi vera         │                           │                      │
│  [Apri scheda]        └───────────────────────────┘                      │
│                                                                          │
│  Da scoprire                                Vedi tutti                   │
│  [poster] [poster] [poster] [poster] [poster] ...                          │
│                                                                          │
│  La tua selezione                  n titoli / risultati                  │
│  Film    Serie    Anime    ...            Temi    Ordina                 │
│  [poster] [poster] [poster] [poster] [poster] [poster]                    │
│  [titolo] [titolo] [titolo] [titolo] [titolo] [titolo]                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Mobile

```text
┌──────────────────────────────┐
│ emoteca.    Cerca + Esplora │
│ In evidenza Libreria Visti… │
├──────────────────────────────┤
│ Dal tuo archivio            │
│ WARRIOR                      │
│ Sinossi                      │
│ [Apri scheda]                │
├──────────────────────────────┤
│ Da scoprire  Vedi tutti       │
│ [poster][poster][poster]...  │
├──────────────────────────────┤
│ La tua selezione             │
│ Formati scorrevoli           │
│ [Tema] [Ordina]              │
│ [poster]     [poster]         │
└──────────────────────────────┘
```

## Principi e implementazione

- **Contenuto prima della decorazione**: hero sempre collegata a un'opera esistente. Titolo, anno, sinossi e locandina provenienti da dati reali; nessuno slogan generico.
- **Navigazione orizzontale**: 5 destinazioni della libreria. La ricerca esterna non è una scheda della libreria: è un'azione esplicita e separata.
- **Gerarchia**: Instrument Serif solo per film/heading editoriali; DM Sans per UI. Gamma cromatica: ink `#111112`, paper `#ede9e2`, accent `#c9aa88`, subdued `#a7a4a0`, separator `#373638`. Colore dei poster lasciato libero.
- **Card semantiche**: pulsante locandina e pulsante preferito sono fratelli, mai annidati; la preferenza espone `aria-pressed`.
- **Diario**: scheda film con informazioni narrative in alto, note e stato nella prima sezione, streaming e metadati nella seconda. Score editoriali opzionali dentro `<details>`, senza percentuali arbitrarie.
- **Responsività strutturale**: nav a due righe su tablet, riga scorrevole su mobile; il visual del poster dell'hero non impedisce la lettura su schermi stretti.
- **Motion**: solo feedback al click e transizioni immagini; rispetto di `prefers-reduced-motion`.
- **Ricerca e dati**: invariati IndexedDB `afterframe-catalog-v1`, formati import/export e backend assente. TMDB token non persistito.

## Skill effettivamente lette e principi applicati

- [Anthropic Frontend Design](https://github.com/anthropics/skills/tree/main/skills/frontend-design): criticare i cliché di prodotto, creare un concetto visivo basato sul soggetto reale, scegliere una singola gerarchia di grande impatto, sostituire il copy generico con contenuto.
- [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill): accessibilità, target touch, contrasto, responsive, feedback e performance. Il repertorio di design search del progetto non è una dipendenza runtime.
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines): button semantics, aria-label, stati focus, reduced-motion, dimensioni immagini, compatibilità tastiera e no scroll orizzontale.

Queste sono indicazioni applicate al codice del prodotto, non pacchetti o template CSS installati.

## Controlli

```bash
node --test tests/*.test.mjs
```

La workflow `ui-e2e.yml` installa Chromium e verifica le principali pagine, i popup, la navigazione e il viewport mobile, catturando screenshot in un artifact GitHub Actions.

È indispensabile rivedere gli screenshot e controllare il sito su browser reale prima di associare il merge a un deploy in produzione.
