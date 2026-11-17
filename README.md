<p align="center">
  <img src="brand/tally-logo.svg" alt="Tally logo" width="96" height="96">
</p>

<h1 align="center">Tally</h1>

<p align="center">
  <strong>Your money, on your computer.</strong><br>
  A free personal finance app for Windows that tracks investments, spending,
  budgets and savings goals, and keeps every byte of your data on your own PC.
</p>

<p align="center">
  <a href="https://github.com/willbpeters/Tally/releases/latest"><img src="https://img.shields.io/github/v/release/willbpeters/Tally?label=release" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-informational" alt="Platform: Windows 10 | 11">
  <img src="https://img.shields.io/badge/price-free-success" alt="Free">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/built%20with-Tauri%202-24C8DB" alt="Built with Tauri 2">
</p>

<!--
  Screenshot: add a capture of the dashboard (using demo data, not real
  balances) at docs/images/dashboard.png and uncomment the line below.
<p align="center"><img src="docs/images/dashboard.png" alt="Tally dashboard" width="900"></p>
-->

---

## What is Tally?

Most budgeting and investing apps work the same way: you hand your bank
logins to a company, your transaction history goes to their servers, and you
pay a monthly fee for the privilege. If the company shuts down, raises prices
or gets breached, your financial history goes with it.

Tally is the opposite. It is a normal desktop program you install on your
Windows PC. There is no account to create, no subscription to Tally, and no
server anywhere holding your data. Everything you enter or sync is saved in a
single file on your computer, backed up automatically, and exportable to a
spreadsheet whenever you like.

It covers the whole picture in one place:

- **Net worth** across all your accounts, with a chart of how it has changed
- **Investments** with what you paid, what they're worth, and how risky your
  portfolio is compared with the S&P 500
- **Markets**: today's indices, a heatmap of your own holdings, and news for the
  companies you own
- **Spending and budgets** with automatic categorization, bill detection and
  a monthly budget per category
- **Savings goals** that tell you how much to set aside each month

### Is Tally for me?

| | |
| --- | --- |
| **Price** | Free. Open source under the MIT license. |
| **Works on** | Windows 10 and 11. There is no Mac or phone version. |
| **Account needed** | No. Nothing to sign up for. |
| **Where your data lives** | On your PC, in a file you can back up, copy or delete. |
| **Bank connection** | Optional. Uses [SimpleFIN](https://www.simplefin.org/), a bank-connection service that charges about $1.50 a month. You can also enter everything by hand or import a spreadsheet. |
| **Who it suits** | Anyone who wants a complete view of their money without trusting a cloud service with it. |

## Get started in five minutes

### 1. Install

1. Open the [latest release](https://github.com/willbpeters/Tally/releases/latest).
2. Under **Assets**, download `Tally_<version>_x64-setup.exe` and run it.
3. Windows may show a blue **"Windows protected your PC"** box. This appears
   for any program whose author hasn't bought a code-signing certificate; it
   does not mean anything is wrong. Click **More info**, then **Run anyway**.

Tally installs for your user only (no administrator prompt) and adds Start
Menu and Desktop shortcuts. When a new version comes out, Tally offers it the
next time you open the app. Your data is kept through every update.

### 2. Add your accounts

Pick whichever fits you. You can mix and match.

- **Connect your bank (recommended).** Go to **Settings → Bank and brokerage
  sync**, follow the link to SimpleFIN, and paste the setup token it gives you.
  Tally pulls in your accounts, balances, holdings and a year of transactions.
  Click **Sync now** whenever you want the latest.
- **Enter accounts by hand.** On the **Accounts** screen, add an account.
  Then record its trades and cash moves on the **Activity** screen, or import
  them from a CSV file; the balance follows from what you record.
- **Just want to try it?** In the bank sync settings, click **Try the demo**
  to load SimpleFIN's sample accounts without connecting anything of your own.
- **Coming from Copilot Money?** Export your transactions from Copilot, then
  use **Settings → Import from Copilot**. Your categories and history come
  across intact.

### 3. Look around

- **Dashboard** is home: net worth, today's change, every account, and the
  last week of activity.
- **Spending** shows this month's transactions sorted into categories. Fix any
  category and Tally remembers your choice for next time.
- **Goals** lets you set a target and see what to put aside each month.

## What you can do

### Dashboard
- Net worth over time, with separate views for investments, cash and debts
- Every account at a glance, grouped by type
- The last seven days of activity

### Holdings and Charts
- Every investment with shares held, cost basis, current value and gain
- How your portfolio is split across holdings and accounts
- Risk measures against the S&P 500: beta, alpha, R², volatility,
  concentration and drawdown from the high
- Prices refresh automatically during market hours, or can be set by hand
- Charts of your holdings over a day, a month, a year or all time

### Markets
- A board of today's major indices, the VIX and Treasury yields, each with a
  one-month sparkline
- Heatmaps of the S&P sectors and of your own holdings, colored by the day's move
- Headlines for the companies you hold, and their upcoming earnings dates

### Spending and budgets
- A monthly budget per category, with progress and what's left
- Transactions sorted automatically by merchant. Correct one and Tally learns
  the rule; new or unsure ones wait in a **To review** list
- Transfers between your own accounts recognized and matched, so they never
  count as spending
- Recurring bills and subscriptions spotted automatically, with the next
  expected date and what is still due this month
- Split one purchase across several categories
- Search by word, amount or size across your whole history
- Undo for every change
- A one-time import of history and categories from
  [Copilot Money](https://www.copilot.money/)

### Goals
- A target amount and an optional deadline for each goal
- Follow a savings account automatically, or update progress by hand
- The monthly contribution needed to make the date

### Between two computers
- Keep Tally in step on two PCs through a shared folder such as Google Drive
  or OneDrive, with no server in between

### Backups
- A backup every day (the last 14 are kept), plus one before every update and
  every restore, and one whenever you ask
- An optional second backup location, such as a USB drive
- One-click restore, and a full export to CSV files you can open in Excel

## Your data and privacy

**Where it lives.** Everything is in one database file on your PC:

| What | Where |
| --- | --- |
| Your data | `%APPDATA%\com.tally.app\finance.sqlite` |
| Automatic backups | `%APPDATA%\com.tally.app\backups\` |

**What leaves your computer.** Only three things ever go out over the
internet, and none of them includes your balances or transactions:

| Tally sends | To whom | Why |
| --- | --- | --- |
| Ticker symbols (such as `AAPL`) | Yahoo Finance, Nasdaq | To fetch prices, news and earnings dates |
| Your SimpleFIN access key | SimpleFIN | To download your bank data, only if you connect a bank |
| A version check | GitHub | To see whether a newer Tally exists |

**Your bank password stays with you.** Tally never sees it. SimpleFIN gives
Tally a read-only key, which is stored in Windows Credential Manager, the same
place Windows keeps your own saved passwords.

**Two things to know.**

- Sync between two computers is off by default. If you turn it on, Tally
  writes a copy of your database and your later edits, unencrypted, into the
  folder you choose. If that folder is in a cloud drive, that provider holds a
  copy of your data.
- The database file itself is not yet encrypted. Anyone who can open files on
  your PC could read it. Encryption and an app lock are on the roadmap.

## Questions you might have

**Is it really free?**
Yes. The only optional cost is SimpleFIN's bank connection, about $1.50 a
month, paid to them, not to Tally.

**Does it work on a Mac, or my phone?**
No. Tally is a Windows desktop app. The code could be built for macOS and
Linux one day, but that is not planned yet.

**What if I stop using Tally?**
Export everything to CSV from **Settings → Backups** and open it in Excel or
any other tool. Your data is never locked in.

**What happens if my computer dies?**
Restore from a backup. Tally keeps 14 daily backups on your PC, and you can
point it at a second location, such as a USB drive or a synced folder, so a
copy always lives somewhere else.

**Why does Windows warn me when I install it?**
Windows warns about any installer that isn't signed with a paid commercial
certificate. Tally's installer is built and signed on GitHub from the code in
this repository, which you can read in full.

**Something isn't working.**
Open an [issue](https://github.com/willbpeters/Tally/issues) with what you
did and what you saw. If the app shows an error message, include it.

---

## For developers

### How it's built

Tally is a [Tauri 2](https://tauri.app) desktop app: a Rust back end owns the
database, the network and the file system, and a React front end renders the
screens. The two talk over Tauri's command bridge.

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri 2 (Rust) |
| Front end | React 19, TypeScript, Vite, React Router |
| State and data fetching | TanStack Query |
| Charts | Recharts |
| Storage | SQLite via `rusqlite` |
| Secrets | Windows Credential Manager via `keyring` |
| Testing | Vitest and Testing Library; `cargo test` |
| CI/CD | GitHub Actions |

Things worth knowing before reading the code:

- **Rust owns all I/O; TypeScript owns the math.** Returns, risk, budgets and
  goal projections live in `src/domain/` as pure functions with no React and
  no I/O, so they are deterministic and cheap to test.
- **Multi-device sync has no server.** SQLite triggers record every user edit
  into an outbox keyed by a stable sync key. Each sync round writes an
  immutable change file to the shared folder and applies the other device's
  changes in one transaction, resolving conflicts per field by logical clock.
  Changes from a newer schema version wait until the receiving device updates.
- **Updates are signed.** The app checks GitHub Releases on launch and refuses
  any update whose signature doesn't verify against the public key in
  `tauri.conf.json`.
- **Prices sit behind a trait.** `PriceProvider` abstracts the price source
  (Yahoo Finance today); account sources (manual, CSV, SimpleFIN) share one
  pattern, so new providers plug in without touching the rest.
- **Tests: about 2,000.** Roughly 1,440 TypeScript tests and 560 Rust tests.
  The release workflow runs all of them before it builds anything.

### Build from source

Prerequisites:

- Windows 10 or 11 (WebView2 is already included)
- [Node.js](https://nodejs.org) 24 or newer
- [Rust](https://rustup.rs) (stable, MSVC toolchain) and the Microsoft C++
  Build Tools ("Desktop development with C++" workload)

> Windows **Smart App Control** blocks locally compiled programs. It must be
> off to run a build of Tally.

```bash
git clone https://github.com/willbpeters/Tally.git
cd Tally
npm install
npm run tauri dev
```

The first run compiles the Rust back end and takes a few minutes. Later runs
start in seconds with hot reloading.

| Command | What it does |
| --- | --- |
| `npm run tauri dev` | Run the app with hot reloading |
| `npm test` | Run the TypeScript tests |
| `cargo test` (in `src-tauri/`) | Run the Rust tests |
| `npm run build` | Type-check and build the front end |
| `npm run tauri build` | Build an unsigned installer locally |

### Project structure

```
├── src/                     React front end
│   ├── app/                 App shell: navigation rail, command bar, update banner
│   ├── features/            One folder per screen (dashboard, holdings, spending, …)
│   ├── domain/              Pure TypeScript finance math (returns, risk, budgets, …)
│   ├── data/                Tauri command bindings and React Query hooks
│   └── ui/                  Shared components, theme and formatting
├── src-tauri/               Rust back end
│   ├── src/                 Database, bank sync, prices, budgets, backups, device sync
│   ├── windows/hooks.nsh    Installer customizations
│   └── tauri.conf.json      App configuration, including the content security policy
├── brand/                   Logo and app icon sources
├── public/                  Static assets served by Vite
├── scripts/                 Version bump and dev launcher
├── .github/workflows/       Release pipeline
└── docs/                    Architecture notes, roadmap, design specs and mockups
```

### Releasing

Releases are built entirely on GitHub Actions, never on a developer's PC:

1. Push changes to `master`.
2. Go to **Actions → Release → Run workflow** and enter the new version, for
   example `0.3.0`.
3. The workflow runs the tests, builds and signs the installer, publishes the
   GitHub Release, and commits the version bump back to `master`. It takes
   about eight minutes. Run `git pull` afterwards.

The update-signing private key exists only as the `TAURI_SIGNING_PRIVATE_KEY`
repository secret and must never be committed. The *Releasing* section of
[`docs/HANDOFF.md`](docs/HANDOFF.md) has the details.

### Further reading

- [`docs/HANDOFF.md`](docs/HANDOFF.md): architecture, data model and known pitfalls
- [`docs/TODO.md`](docs/TODO.md): the prioritized list of open work
- [`docs/superpowers/specs/`](docs/superpowers/specs/): a design document per feature
- [`docs/superpowers/plans/`](docs/superpowers/plans/): the implementation plan for each

### Contributing

Issues and pull requests are welcome. For anything larger than a bug fix,
open an issue first so we can agree on the approach. Please keep the tests
green (`npm test` and `cargo test`) and follow the existing style: comments
explain *why*, not *what*.

## Roadmap

- Encrypted database with a Windows Hello or password lock
- Deeper risk analytics: historical VaR, correlation matrix, ETF overlap
- Crypto, real estate and other asset types
- Optional, fully offline AI summaries on the Markets screen (via Ollama)
- Multiple currencies

The full, ordered list is in [`docs/TODO.md`](docs/TODO.md).

## License

[MIT](LICENSE). Use it, fork it, learn from it.

## Author

**Will Peters** · [@willbpeters](https://github.com/willbpeters)
