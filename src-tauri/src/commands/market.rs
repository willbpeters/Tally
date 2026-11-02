//! Commands for the Markets screen. These return rows, never a finished
//! screen: assembly lives in `src/domain/market.ts` so it can be unit-tested
//! the way `derivePortfolio` is.
use crate::db::Db;
use crate::market::{self, store};
use tauri::Manager;

#[tauri::command]
pub fn market_news_list(db: tauri::State<Db>) -> Result<Vec<store::StoredNews>, String> {
    let conn = db.0.lock().unwrap_or_else(|e| e.into_inner());
    store::list_news(&conn, market::NEWS_PER_SECURITY).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn market_earnings_list(db: tauri::State<Db>) -> Result<Vec<store::EarningsEvent>, String> {
    let conn = db.0.lock().unwrap_or_else(|e| e.into_inner());
    store::list_earnings(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn market_profiles_list(
    db: tauri::State<Db>,
) -> Result<Vec<crate::market::profile::SecurityProfile>, String> {
    let conn = db.0.lock().unwrap_or_else(|e| e.into_inner());
    store::list_profiles(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn market_indices(db: tauri::State<Db>) -> Result<Vec<store::IndexQuote>, String> {
    let conn = db.0.lock().unwrap_or_else(|e| e.into_inner());
    store::list_index_quotes(&conn).map_err(|e| e.to_string())
}

/// A full refresh. Takes the database lock only to read and to store, never
/// across a download — see `market::refresh_all`.
#[tauri::command]
pub async fn market_refresh(app: tauri::AppHandle) -> Result<market::MarketRefreshReport, String> {
    super::off_main_thread(move || Ok(market::refresh_all(&app.state::<Db>(), &market::LiveSource)))
        .await
}

/// Just the board — indices, yields, sectors — in one request. Polled on the
/// price cadence, so the Markets screen moves through the day.
#[tauri::command]
pub async fn market_board_refresh(app: tauri::AppHandle) -> Result<market::MarketRefreshReport, String> {
    super::off_main_thread(move || {
        let mut report = market::MarketRefreshReport::default();
        market::refresh_board(&app.state::<Db>(), &market::LiveSource, &mut report);
        Ok(report)
    })
    .await
}

/// Price lines for the Charts screen and the Dashboard chart, fetched live and
/// never stored. `timeframe` is one of `chart::timeframe`'s names.
#[tauri::command]
pub async fn market_chart(symbols: Vec<String>, timeframe: String) -> Result<Vec<market::chart::ChartSeries>, String> {
    super::off_main_thread(move || {
        let tf = market::chart::timeframe(&timeframe).ok_or_else(|| format!("unknown timeframe: {timeframe}"))?;
        market::chart::fetch(&symbols, &tf, chrono::Utc::now().timestamp()).map_err(|e| e.to_string())
    })
    .await
}

/// Two years of benchmark closes, oldest first, as (date, close).
#[tauri::command]
pub fn market_index_history(db: tauri::State<Db>) -> Result<Vec<(String, f64)>, String> {
    let conn = db.0.lock().unwrap_or_else(|e| e.into_inner());
    store::index_history(&conn, market::indices::BENCHMARK).map_err(|e| e.to_string())
}

/// How many benchmark closes are stored. The frontend backfills when this is
/// short, so it is not re-downloaded on every launch.
#[tauri::command]
pub fn market_index_depth(db: tauri::State<Db>) -> Result<i64, String> {
    let conn = db.0.lock().unwrap_or_else(|e| e.into_inner());
    store::index_history_depth(&conn, market::indices::BENCHMARK).map_err(|e| e.to_string())
}

/// Download the benchmark's two-year history. Run rarely — see
/// `backfill_benchmark`.
#[tauri::command]
pub async fn market_index_backfill(app: tauri::AppHandle) -> Result<usize, String> {
    super::off_main_thread(move || market::backfill_benchmark(&app.state::<Db>())).await
}
