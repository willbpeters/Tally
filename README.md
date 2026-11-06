<p align="center">
  <img src="brand/tally-logo.svg" alt="Tally logo" width="96" height="96">
</p>

<h1 align="center">Tally</h1>

<p align="center">
  <strong>A private, local-first personal finance app for Windows.</strong><br>
  Investments, spending, budgets and goals in one desktop app, with every byte of data kept on your own computer.
</p>

<p align="center">
  <a href="https://github.com/willbpeters/Tally/releases/latest"><img src="https://img.shields.io/github/v/release/willbpeters/Tally?label=release" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-informational" alt="Platform: Windows 10 | 11">
  <img src="https://img.shields.io/badge/built%20with-Tauri%202-24C8DB" alt="Built with Tauri 2">
  <img src="https://img.shields.io/badge/Rust-stable-orange" alt="Rust">
  <img src="https://img.shields.io/badge/React-19-61DAFB" alt="React 19">
</p>

<!--
  Screenshot: add a capture of the dashboard (using demo data, not real
  balances) at docs/images/dashboard.png and uncomment the line below.
<p align="center"><img src="docs/images/dashboard.png" alt="Tally dashboard" width="900"></p>
-->

---

## Overview

Most personal finance apps ask you to hand your bank logins and full
transaction history to a cloud service and pay a monthly subscription for the
privilege. Tally takes the opposite approach: it is a native desktop app that
stores everything in a local SQLite database, works without an account, and
only reaches the network for public market data and the bank connection you
choose to set up.

It covers the whole picture in one place: net worth, an investment portfolio
with lot-level cost basis and risk analytics, a live markets board, categorized
spending with budgets and recurring-bill detection, and savings goals.

## Table of contents

- [Features](#features)
- [Engineering highlights](#engineering-highlights)
- [Tech stack](#tech-stack)
- [Privacy and security](#privacy-and-security)
- [Installation](#installation)
- [Data and backups](#data-and-backups)
- [Development](#development)
- [Project structure](#project-structure)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Author](#author)

## Features

### Dashboard
- Net worth over time, with views for investments, cash and liabilities
- Every account at a glance, grouped by type
- The last seven days of activity

### Investments
- Holdings with lot-level cost basis, gains and allocation
- Risk metrics benchmarked against the S&P 500: beta, alpha, R², volatility,
  concentration and drawdown from the high
- Prices refreshed automatically during market hours, or entered manually

### Markets
- A "Today" board covering the major indices, the VIX and Treasury yields,
  each with a one-month sparkline
- Heatmaps of the S&P sectors and of your own holdings, colored by the day's move
- Headlines for the companies you hold, and upcoming earnings dates

### Spending and budgets
- Monthly budgets per category, with progress and remaining balance
- Automatic categorization by merchant, with rules that learn from your
  corrections and a "To review" queue for new transactions
- Transfers between your own accounts detected and matched
- Recurring bills and subscriptions detected automatically, with the next
  expected date and what is still due this month
- Split transactions: one purchase becomes separate transactions in their own
  categories, with the remainder filled in automatically
- Undo for every change
- One-time import of history and categories from
  [Copilot Money](https://www.copilot.money/) CSV exports

### Goals
- Savings goals with a target amount and optional deadline
- Track a savings account automatically, or update progress by hand
- The monthly contribution needed to reach each goal on time

### Bank sync and multi-device
- Balances, holdings and transactions from banks and brokerages via
  [SimpleFIN](https://www.simplefin.org/)
- Sync your edits between two computers through a shared folder (for example
  Google Drive), with no server in between

### Data safety
- Automatic daily backups (last 14 kept), plus backups before every database
  upgrade, before every restore, and on demand
- An optional second backup location, such as a USB drive or synced folder
- One-click restore and full export to CSV

## Engineering highlights

- **Clear separation of concerns.** Rust owns all file, network and database
  access; the finance math (returns, risk, budgets) lives in pure TypeScript in
  `src/domain/` with no React or I/O, which keeps it deterministic and easy to
  test.
- **Serverless multi-device sync.** SQLite triggers record user edits into an
  outbox keyed by a stable sync key. Each sync round writes an immutable change
  file to a shared folder and applies the other device's changes in a single
  transaction, resolving conflicts per field (last writer wins by logical
  clock). Changes from a newer schema version wait until the receiving device
  is updated.
- **Signed auto-updates.** The app checks for releases on launch and refuses
  any update whose signature doesn't verify.
- **One-click release pipeline.** A GitHub Actions workflow runs the full test
  suite, bumps the version, builds and signs the installer, and publishes a
  GitHub Release.
- **Thorough test coverage.** 1,300+ automated tests: roughly 760 TypeScript
  tests (Vitest, Testing Library) and 570 Rust tests (`cargo test`).
- **Extensible by design.** Price data sits behind a `PriceProvider` trait,
  and account sources (manual, CSV, SimpleFIN) share a common pattern, so new
  providers plug in without touching the rest of the app.

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | [Tauri 2](https://tauri.app) (Rust) |
| Front end | React 19, TypeScript, Vite, React Router |
| State and data fetching | TanStack Query |
| Charts | Recharts |
| Storage | SQLite via `rusqlite` |
| Secrets | Windows Credential Manager |
| Testing | Vitest, Testing Library, `cargo test` |
| CI/CD | GitHub Actions |

## Privacy and security

- **Financial data never leaves your computer.** It is stored in a local
  SQLite database, not on a server.
- Market prices and news come from free public sources. Only ticker symbols
  are sent to fetch them, never amounts or account details.
- SimpleFIN credentials are stored in Windows Credential Manager, not in the
  database.
- Device sync files are written only to a folder you choose.
- The database is not yet encrypted. Encryption (SQLCipher) and an app lock
  are on the [roadmap](#roadmap).

## Installation

1. Open the [latest release](https://github.com/willbpeters/Tally/releases/latest).
2. Under **Assets**, download `Tally_<version>_x64-setup.exe` and run it.
3. Windows SmartScreen may show **"Windows protected your PC"** because the
   installer isn't code-signed with a commercial certificate. Click
   **More info → Run anyway**.

Tally installs per user (no administrator prompt) and adds Start Menu and
Desktop shortcuts. New versions are offered automatically when the app opens,
and your data carries over untouched.

## Data and backups

| What | Location |
| --- | --- |
| Database | `%APPDATA%\com.ledgerly.app\finance.sqlite` |
| Automatic backups | `%APPDATA%\com.ledgerly.app\backups\` |

Back up, restore and export from **Settings → Backups**. A restore takes a
fresh backup first, so it can always be undone.

> The data folder keeps the app's original name, **Ledgerly** (used until
> v0.1.3), so existing installs stay connected to their data.

## Development

### Prerequisites

- Windows 10 or 11 (WebView2 is included)
- [Node.js](https://nodejs.org) 24 or newer
- [Rust](https://rustup.rs) (stable, MSVC toolchain) and the Microsoft C++
  Build Tools ("Desktop development with C++" workload)

> **Note:** Windows **Smart App Control** blocks locally compiled binaries and
> must be turned off to build Tally.

### Getting started

```bash
git clone https://github.com/willbpeters/Tally.git
cd Tally
npm install
npm run tauri dev
```

The first run compiles the Rust back end and takes a few minutes; later runs
start in seconds with hot reloading.

### Common commands

| Command | Description |
| --- | --- |
| `npm run tauri dev` | Run the app in development mode |
| `npm test` | Run the TypeScript test suite |
| `cargo test` (in `src-tauri/`) | Run the Rust test suite |
| `npm run build` | Type-check and build the front end |
| `npm run tauri build` | Build an unsigned installer locally |

### Releasing

Releases are built entirely on GitHub Actions:

1. Push changes to `master`.
2. Go to **Actions → Release → Run workflow** and enter the new version
   (for example `0.3.0`).
3. The workflow tests, builds, signs and publishes the release (about 8
   minutes), then commits the version bump back to `master`. Run `git pull`
   afterwards.

Updates are signed with a private key stored only as the
`TAURI_SIGNING_PRIVATE_KEY` repository secret; it must never be committed. See
the *Releasing* section of [`docs/HANDOFF.md`](docs/HANDOFF.md) for details.

## Project structure

```
├── src/                     React front end
│   ├── app/                 App shell: navigation, command bar, update banner
│   ├── features/            One folder per screen (dashboard, holdings, …)
│   ├── domain/              Pure TypeScript finance math (returns, risk, …)
│   ├── data/                Tauri command bindings and React Query hooks
│   └── ui/                  Shared components, theme and formatting
├── src-tauri/               Rust back end
│   ├── src/                 Database, bank sync, prices, budgets, backups,
│   │                        device sync
│   ├── windows/hooks.nsh    Installer customizations
│   └── tauri.conf.json      App configuration
├── brand/                   Logo and app icon sources
├── public/                  Static assets served by Vite
├── scripts/                 Version bump and dev launcher
├── .github/workflows/       Release pipeline
└── docs/                    Architecture notes, roadmap, design specs and mockups
```

## Roadmap

- Encrypted database (SQLCipher) with Windows Hello or password app lock
- Advanced risk analytics: historical VaR/CVaR, correlation matrix, ETF overlap
- Crypto and other asset types (real estate, private holdings)
- Optional local AI summaries on the Markets screen (via Ollama, fully offline)
- Multi-currency support

The full, prioritized list is in [`docs/TODO.md`](docs/TODO.md).

## Documentation

- [`docs/HANDOFF.md`](docs/HANDOFF.md): architecture, data model and known
  pitfalls
- [`docs/TODO.md`](docs/TODO.md): prioritized roadmap
- [`docs/superpowers/specs/`](docs/superpowers/specs/): design document for
  each feature
- [`docs/superpowers/plans/`](docs/superpowers/plans/): implementation plans

## Author

**Will Peters**: [GitHub @willbpeters](https://github.com/willbpeters)
