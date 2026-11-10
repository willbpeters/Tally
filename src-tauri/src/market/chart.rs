//! Price lines for the Charts screen and the Dashboard chart: intraday bars for
//! the short timeframes, daily or weekly closes for the long ones.
//!
//! Fetched live from Yahoo's spark endpoint — up to 20 symbols per request —
//! and never stored. The `prices` table keeps one close per day, which is right
//! for the day-change and risk maths but draws a 1-day chart as two points.

use serde::Serialize;
use serde_json::Value;

/// How one timeframe is asked for. `keep_secs` trims a wider Yahoo range down
/// to the timeframe, for the ones Yahoo has no range of its own for.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Timeframe {
    pub range: &'static str,
    pub interval: &'static str,
    pub keep_secs: Option<i64>,
}

const DAY: i64 = 86_400;

/// The bar size per timeframe, after the way Robinhood draws its account
/// chart: roughly 60 to 250 evenly spaced points whatever the timeframe, so the
/// line has texture without turning to noise. Finer bars were tried (2-minute
/// days, hourly quarters) and read as jitter.
///
/// | timeframe | bars       | points (a stock) |
/// |-----------|------------|------------------|
/// | 1D        | 5 minutes  | ~78              |
/// | 1W        | 15 minutes | ~130-155         |
/// | 1M        | 1 hour     | ~150             |
/// | 3M        | 1 day      | ~63              |
/// | 1Y        | 1 day      | ~250             |
/// | 3Y        | 1 week     | ~156             |
/// | 5Y        | 1 week     | ~260             |
/// | Max       | 1 week     | decades × 52     |
///
/// The screen thins the longest ones; see `thin` in `domain/charts.ts`.
pub fn timeframe(name: &str) -> Option<Timeframe> {
    let tf = |range, interval, keep_secs| Some(Timeframe { range, interval, keep_secs });
    match name {
        "1d" => tf("1d", "5m", None),
        // Seven calendar days: Yahoo has no such range, so a month is trimmed.
        "1w" => tf("1mo", "15m", Some(7 * DAY)),
        "1m" => tf("1mo", "60m", None),
        "3m" => tf("3mo", "1d", None),
        "1y" => tf("1y", "1d", None),
        "3y" => tf("5y", "1wk", Some(3 * 365 * DAY)),
        "5y" => tf("5y", "1wk", None),
        // Asked for by date, one symbol at a time: see `max_url`.
        "max" => tf("max", "1wk", None),
        _ => None,
    }
}

fn is_intraday(interval: &str) -> bool {
    interval.ends_with('m') && interval != "1mo"
}

/// One symbol's line. `points` are (unix seconds, close), oldest first.
/// `previous_close` is the close before the first point — what a 1-day chart
/// measures the day's move from. `daily_only` marks a mutual fund on an
/// intraday chart: one close a day, each moved to the session's close.
/// `estimated` marks such a fund whose day has been filled in from its
/// tracking ETF — see `estimate_from_proxy`.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct ChartSeries {
    pub symbol: String,
    pub previous_close: Option<f64>,
    pub points: Vec<(i64, f64)>,
    pub daily_only: bool,
    pub estimated: bool,
}

pub fn spark_url(symbols: &[&str], tf: &Timeframe) -> String {
    format!(
        "https://query1.finance.yahoo.com/v7/finance/spark?symbols={}&range={}&interval={}",
        super::indices::encode_symbols(symbols),
        tf.range,
        tf.interval
    )
}

/// The single-symbol chart endpoint, from the epoch. Only "max" uses it: the
/// spark endpoint ignores dates, and its own "max" range drops to monthly bars.
pub fn max_url(symbol: &str, tf: &Timeframe, now: i64) -> String {
    format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{}?period1=0&period2={now}&interval={}",
        super::indices::encode_symbols(&[symbol]),
        tf.interval
    )
}

/// Regular-session length, open to close.
const SESSION_SECS: i64 = 6 * 3600 + 30 * 60;
/// The regular session's open, after local midnight: 09:30.
const OPEN_SECS: i64 = 9 * 3600 + 30 * 60;

/// Each symbol in a spark response as a `ChartSeries`.
///
/// Mutual funds have no intraday prices: asked for 2-minute bars, Yahoo sends
/// one daily bar stamped at the *open*. A fund's price is set at the close, so
/// on an intraday chart its bar is moved to the close. Left at the open, a
/// portfolio line would take the fund's whole day's move at 9:30, hours before
/// anyone could know it.
pub fn parse_spark(body: &str, tf: &Timeframe, now: i64) -> Vec<ChartSeries> {
    let v: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let Some(results) = v["spark"]["result"].as_array() else { return vec![] };
    results
        .iter()
        .filter_map(|r| parse_result(r["symbol"].as_str()?, &r["response"][0], tf, now))
        .collect()
}

/// `max_url`'s answer: one chart result, the same shape as a spark response.
pub fn parse_chart(symbol: &str, body: &str, tf: &Timeframe, now: i64) -> Option<ChartSeries> {
    let v: Value = serde_json::from_str(body).ok()?;
    parse_result(symbol, &v["chart"]["result"][0], tf, now)
}

fn parse_result(symbol: &str, res: &Value, tf: &Timeframe, now: i64) -> Option<ChartSeries> {
    let symbol = symbol.to_string();
    let granularity = res["meta"]["dataGranularity"].as_str().unwrap_or(tf.interval);
    let shift = if is_intraday(tf.interval) && !is_intraday(granularity) { SESSION_SECS } else { 0 };
    // A mutual fund on a 1-day chart comes back with no bars at all, only a meta.
    let none = Vec::new();
    let ts = res["timestamp"].as_array().unwrap_or(&none);
    let closes = res["indicators"]["quote"][0]["close"].as_array().unwrap_or(&none);
    let mut points: Vec<(i64, f64)> = ts
        .iter()
        .zip(closes)
        .filter_map(|(t, c)| Some((t.as_i64()? + shift, c.as_f64()?)))
        .collect();
    let mut previous_close = res["meta"]["chartPreviousClose"].as_f64();
    if let Some(keep) = tf.keep_secs {
        let cut = now - keep;
        if let Some(last_dropped) = points.iter().rev().find(|(t, _)| *t < cut) {
            previous_close = Some(last_dropped.1);
        }
        points.retain(|(t, _)| *t >= cut);
    }
    let daily_only = shift != 0;
    if daily_only {
        if let Some(close) = published_close(&res["meta"]) {
            if points.last().is_none_or(|(t, _)| *t < close.0) { points.push(close); }
        }
    }
    // A fund with no bars is still worth returning when its last close is
    // known: that close is what `estimate_from_proxy` builds today on. Dropped,
    // the fund had no estimate and sat at the last session's price all day.
    (!points.is_empty() || (daily_only && previous_close.is_some())).then_some(ChartSeries {
        symbol, previous_close, points, daily_only, estimated: false,
    })
}

/// A fund's latest NAV from the meta, placed at the close of the New York day
/// it was published on, as its daily bars are.
///
/// Yahoo puts a fund's NAV in the meta hours before the day's bar has it — the
/// bar is missing or blank all evening — so without this the real price never
/// replaced the estimate until the next morning.
fn published_close(meta: &Value) -> Option<(i64, f64)> {
    let price = meta["regularMarketPrice"].as_f64()?;
    let time = meta["regularMarketTime"].as_i64()?;
    let offset = meta["gmtoffset"].as_i64().unwrap_or(0);
    let midnight = (time + offset).div_euclid(DAY) * DAY - offset;
    Some((midnight + OPEN_SECS + SESSION_SECS, price))
}

/// A mutual fund's day, estimated bar by bar from an ETF tracking the same
/// index — what lets a portfolio of funds move like a stock chart instead of
/// sitting flat all day and stepping at the close.
///
/// Each ETF bar gives the fund's last real price times the ETF's move since
/// that price was set. Each real close then replaces the estimate at its time
/// and becomes the new starting point, so an estimate is never more than one
/// session old and every finished day ends on the fund's real price. A close
/// from before the ETF's first bar only sets the starting point: it would
/// otherwise open the chart a day early.
///
/// None without the fund's previous close, which every estimate starts from.
pub fn estimate_from_proxy(fund: &ChartSeries, proxy: &ChartSeries) -> Option<ChartSeries> {
    let first_bar = proxy.points.first()?.0;
    let mut real = fund.previous_close?;
    let mut base = proxy.previous_close.unwrap_or(proxy.points[0].1);
    let mut last_proxy: Option<f64> = None;
    let mut previous_close = None;
    let mut points: Vec<(i64, f64)> = Vec::new();

    // Bars sort before closes at the same instant, so the close replaces the estimate.
    let mut events: Vec<(i64, bool, f64)> = proxy.points.iter().map(|&(t, v)| (t, false, v))
        .chain(fund.points.iter().map(|&(t, v)| (t, true, v)))
        .collect();
    events.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

    for (t, is_close, v) in events {
        if is_close {
            if t >= first_bar {
                match points.last_mut() {
                    Some(last) if last.0 == t => last.1 = v,
                    _ => points.push((t, v)),
                }
            }
            real = v;
            if let Some(p) = last_proxy { base = p; }
        } else {
            if previous_close.is_none() { previous_close = Some(real); }
            points.push((t, real * v / base));
            last_proxy = Some(v);
        }
    }
    Some(ChartSeries {
        symbol: fund.symbol.clone(), previous_close, points, daily_only: fund.daily_only, estimated: true,
    })
}

/// The tracking ETFs to ask for beside `symbols` on an intraday timeframe:
/// one per fund that has one, unless it was asked for already.
fn proxies_for(symbols: &[String], tf: &Timeframe) -> Vec<String> {
    if !is_intraday(tf.interval) { return vec![]; }
    let mut out: Vec<String> = Vec::new();
    for s in symbols {
        if let Some(etf) = super::benchmarks::proxy_for(s) {
            let asked = symbols.iter().any(|a| a.eq_ignore_ascii_case(etf));
            if !asked && !out.iter().any(|o| o == etf) { out.push(etf.to_string()); }
        }
    }
    out
}

/// Every requested symbol's line, each daily-only fund replaced by its
/// estimate where its ETF came back. ETFs fetched only for this are dropped.
pub fn with_estimates(requested: &[String], fetched: Vec<ChartSeries>) -> Vec<ChartSeries> {
    let find = |sym: &str| fetched.iter().find(|s| s.symbol.eq_ignore_ascii_case(sym));
    requested
        .iter()
        .filter_map(|sym| {
            let series = find(sym)?;
            if series.daily_only {
                let estimate = super::benchmarks::proxy_for(sym)
                    .and_then(find)
                    .and_then(|proxy| estimate_from_proxy(series, proxy));
                if let Some(est) = estimate { return Some(est); }
            }
            Some(series.clone())
        })
        .collect()
}

/// Every symbol's line for one timeframe, in as few requests as the batch
/// limit allows. A symbol Yahoo cannot serve is simply absent.
pub fn fetch(symbols: &[String], tf: &Timeframe, now: i64) -> anyhow::Result<Vec<ChartSeries>> {
    let client = crate::http::client()?;
    let refs: Vec<&str> = symbols.iter().map(String::as_str).collect();
    let mut out = Vec::new();
    if tf.range == "max" {
        for symbol in refs {
            let body = client.get(max_url(symbol, tf, now)).send()?.text()?;
            out.extend(parse_chart(symbol, &body, tf, now));
        }
        return Ok(out);
    }
    // The funds' tracking ETFs ride in the same batch: six funds and four
    // stocks are still one request.
    let extra = proxies_for(symbols, tf);
    let all: Vec<&str> = refs.iter().copied().chain(extra.iter().map(String::as_str)).collect();
    for chunk in all.chunks(super::indices::SPARK_BATCH) {
        let body = client.get(spark_url(chunk, tf)).send()?.text()?;
        out.extend(parse_spark(&body, tf, now));
    }
    Ok(with_estimates(symbols, out))
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_793_500_000;

    #[test]
    fn every_timeframe_on_the_screen_is_known() {
        for name in ["1d", "1w", "1m", "3m", "1y", "3y", "5y", "max"] {
            assert!(timeframe(name).is_some(), "{name}");
        }
        assert!(timeframe("5d").is_none(), "1W shows the same five sessions");
    }

    #[test]
    fn short_timeframes_ask_for_intraday_bars() {
        let url = spark_url(&["GOOG", "^GSPC"], &timeframe("1d").unwrap());
        assert!(url.contains("symbols=GOOG,%5EGSPC"), "{url}");
        assert!(url.contains("range=1d&interval=5m"), "{url}");
    }

    #[test]
    fn max_asks_by_date_so_the_bars_stay_weekly() {
        let url = max_url("GOOG", &timeframe("max").unwrap(), NOW);
        assert!(url.contains("/v8/finance/chart/GOOG?"), "{url}");
        assert!(url.contains(&format!("period1=0&period2={NOW}&interval=1wk")), "{url}");
    }

    #[test]
    fn a_chart_response_parses_like_a_spark_one() {
        let tf = timeframe("max").unwrap();
        let body = r#"{"chart":{"result":[{"meta":{"dataGranularity":"1wk"},
            "timestamp":[1,2],"indicators":{"quote":[{"close":[3.0,4.0]}]}}]}}"#;
        let got = parse_chart("GOOG", body, &tf, NOW).unwrap();
        assert_eq!(got.symbol, "GOOG");
        assert_eq!(got.points, vec![(1, 3.0), (2, 4.0)]);
    }

    fn body(granularity: &str, ts: &[i64], closes: &str) -> String {
        format!(
            r#"{{"spark":{{"result":[{{"symbol":"X","response":[{{
                "meta":{{"dataGranularity":"{granularity}","chartPreviousClose":10.0}},
                "timestamp":{ts:?},
                "indicators":{{"quote":[{{"close":{closes}}}]}}
            }}]}}]}}}}"#
        )
    }

    #[test]
    fn intraday_bars_are_parsed_with_their_times_and_nulls_skipped() {
        let tf = timeframe("1d").unwrap();
        let got = parse_spark(&body("5m", &[100, 400, 700], "[11.0,null,12.0]"), &tf, NOW);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].points, vec![(100, 11.0), (700, 12.0)]);
        assert_eq!(got[0].previous_close, Some(10.0));
        assert!(!got[0].daily_only);
    }

    #[test]
    fn a_funds_daily_bar_on_an_intraday_chart_moves_to_the_close() {
        let tf = timeframe("1d").unwrap();
        let open = 1_793_367_000; // 09:30 New York
        let got = parse_spark(&body("1d", &[open], "[19.59]"), &tf, NOW);
        assert_eq!(got[0].points, vec![(open + SESSION_SECS, 19.59)]);
        assert!(got[0].daily_only);
    }

    #[test]
    fn a_daily_chart_leaves_daily_bars_where_they_are() {
        let tf = timeframe("1y").unwrap();
        let got = parse_spark(&body("1d", &[1000], "[5.0]"), &tf, NOW);
        assert_eq!(got[0].points, vec![(1000, 5.0)]);
    }

    #[test]
    fn a_trimmed_timeframe_keeps_its_window_and_measures_from_the_last_dropped_close() {
        let tf = timeframe("1w").unwrap();
        let old = NOW - 8 * DAY;
        let older = NOW - 9 * DAY;
        let recent = NOW - DAY;
        let got = parse_spark(&body("15m", &[older, old, recent], "[1.0,2.0,3.0]"), &tf, NOW);
        assert_eq!(got[0].points, vec![(recent, 3.0)]);
        assert_eq!(got[0].previous_close, Some(2.0));
    }

    // Yahoo's 1-day answer for a mutual fund has no bars at all, only a meta.
    // Monday 2026-11-09, New York: session 14:30–21:00 UTC.
    const MON_OPEN: i64 = 1_794_234_600;
    const MON_CLOSE: i64 = 1_794_258_000;

    fn fund_meta_only(price_and_time: Option<(f64, i64)>) -> String {
        let extra = price_and_time
            .map(|(p, t)| format!(r#","regularMarketPrice":{p},"regularMarketTime":{t}"#))
            .unwrap_or_default();
        format!(
            r#"{{"spark":{{"result":[{{"symbol":"SWPPX","response":[{{
                "meta":{{"dataGranularity":"1d","chartPreviousClose":19.07,"gmtoffset":-18000{extra}}},
                "indicators":{{"quote":[{{}}]}}
            }}]}}]}}}}"#
        )
    }

    #[test]
    fn a_fund_with_no_bars_today_still_comes_back_with_its_previous_close() {
        let tf = timeframe("1d").unwrap();
        let got = parse_spark(&fund_meta_only(None), &tf, NOW);
        assert_eq!(got.len(), 1, "dropping it left the fund with no estimate");
        assert_eq!(got[0].previous_close, Some(19.07));
        assert!(got[0].points.is_empty());
        assert!(got[0].daily_only);
    }

    #[test]
    fn a_nav_published_today_lands_at_todays_close() {
        let tf = timeframe("1d").unwrap();
        let got = parse_spark(&fund_meta_only(Some((19.52, 1_794_268_437))), &tf, NOW);
        assert_eq!(got[0].points, vec![(MON_CLOSE, 19.52)]);
    }

    #[test]
    fn a_fund_with_no_bars_today_is_estimated_from_its_etf() {
        let tf = timeframe("1d").unwrap();
        // Friday's NAV, published Friday evening: not news on Monday.
        let mut fetched = parse_spark(&fund_meta_only(Some((19.07, MON_OPEN - 2 * DAY - 39_000))), &tf, NOW);
        fetched.push(series("IVV", Some(738.68), &[(MON_OPEN, 746.70), (MON_CLOSE - 300, 756.05)], false));
        let got = with_estimates(&["SWPPX".to_string()], fetched);
        assert_eq!(got.len(), 1);
        assert!(got[0].estimated);
        assert_eq!(got[0].previous_close, Some(19.07));
        let last = got[0].points.last().unwrap().1;
        assert!((last - 19.07 * 756.05 / 738.68).abs() < 1e-9, "{last}");
    }

    #[test]
    fn garbage_and_failed_symbols_give_nothing() {
        let tf = timeframe("1d").unwrap();
        assert!(parse_spark("not json", &tf, NOW).is_empty());
        assert!(parse_spark(r#"{"spark":{"result":null}}"#, &tf, NOW).is_empty());
        let empty = r#"{"spark":{"result":[{"symbol":"X","response":[{"meta":{}}]}]}}"#;
        assert!(parse_spark(empty, &tf, NOW).is_empty());
    }

    fn series(symbol: &str, previous_close: Option<f64>, points: &[(i64, f64)], daily_only: bool) -> ChartSeries {
        ChartSeries { symbol: symbol.into(), previous_close, points: points.to_vec(), daily_only, estimated: false }
    }

    #[test]
    fn a_funds_day_follows_its_etfs_percentage_move() {
        let etf = series("IVV", Some(100.0), &[(10, 101.0), (20, 99.0)], false);
        let fund = series("SWPPX", Some(20.0), &[], true);
        let est = estimate_from_proxy(&fund, &etf).unwrap();
        assert_eq!(est.points, vec![(10, 20.2), (20, 19.8)]);
        assert_eq!(est.previous_close, Some(20.0));
        assert!(est.estimated);
    }

    #[test]
    fn the_real_close_replaces_the_estimate_and_starts_the_next_day() {
        // Day one ends with the ETF up 2% but the fund's real price up only 1%;
        // day two builds on the real price, not on the estimate.
        let etf = series("IVV", Some(100.0), &[(10, 101.0), (20, 102.0), (30, 112.2)], false);
        let fund = series("SWPPX", Some(20.0), &[(20, 20.2)], true);
        let est = estimate_from_proxy(&fund, &etf).unwrap();
        assert_eq!(est.points.len(), 3);
        assert_eq!(est.points[1], (20, 20.2));
        assert!((est.points[2].1 - 22.22).abs() < 1e-9, "{:?}", est.points[2]);
    }

    #[test]
    fn yesterdays_close_only_sets_the_start_of_a_live_day() {
        let etf = series("IVV", Some(100.0), &[(50, 110.0)], false);
        let fund = series("SWPPX", Some(19.0), &[(20, 20.0)], true);
        let est = estimate_from_proxy(&fund, &etf).unwrap();
        assert_eq!(est.points, vec![(50, 22.0)]);
        assert_eq!(est.previous_close, Some(20.0));
    }

    #[test]
    fn a_fund_whose_etf_did_not_come_back_keeps_its_closes_and_extra_etfs_are_dropped() {
        let requested = vec!["SWPPX".to_string(), "SWLGX".to_string(), "GOOG".to_string()];
        let fetched = vec![
            series("SWPPX", Some(20.0), &[(20, 20.5)], true),
            series("SWLGX", Some(18.0), &[(20, 18.1)], true),
            series("GOOG", Some(270.0), &[(10, 271.0), (20, 272.0)], false),
            series("IVV", Some(100.0), &[(10, 101.0), (20, 102.0)], false),
        ];
        let got = with_estimates(&requested, fetched);
        let symbols: Vec<&str> = got.iter().map(|s| s.symbol.as_str()).collect();
        assert_eq!(symbols, vec!["SWPPX", "SWLGX", "GOOG"]);
        assert!(got[0].estimated, "IVV came back");
        assert!(!got[1].estimated, "IWF did not");
        assert!(!got[2].estimated, "a stock needs no estimate");
    }

    #[test]
    fn tracking_etfs_are_asked_for_only_on_intraday_charts() {
        let symbols = vec!["SWPPX".to_string(), "GOOG".to_string(), "IVV".to_string()];
        assert!(proxies_for(&symbols, &timeframe("1d").unwrap()).is_empty(), "IVV is already asked for");
        let symbols = vec!["SWPPX".to_string(), "SWLGX".to_string()];
        assert_eq!(proxies_for(&symbols, &timeframe("1w").unwrap()), vec!["IVV", "IWF"]);
        assert!(proxies_for(&symbols, &timeframe("1y").unwrap()).is_empty());
    }

    /// Hits the network. Run with:
    /// `cargo test --lib live_chart -- --ignored --nocapture`
    #[test]
    #[ignore = "hits the network"]
    fn live_chart_returns_enough_points_for_every_timeframe() {
        let now = chrono::Utc::now().timestamp();
        for name in ["1d", "1w", "1m", "3m", "1y", "3y", "5y", "max"] {
            let tf = timeframe(name).unwrap();
            let got = fetch(&["GOOG".into(), "SWPPX".into()], &tf, now).unwrap();
            for s in &got {
                println!("{name} {}: {} points, estimated: {}", s.symbol, s.points.len(), s.estimated);
            }
            let goog = got.iter().find(|s| s.symbol == "GOOG").expect("GOOG");
            assert!(goog.points.len() >= 50, "{name}: {}", goog.points.len());
            // The fund is estimated from IVV on intraday charts, so it has bars too.
            let fund = got.iter().find(|s| s.symbol == "SWPPX").expect("SWPPX");
            assert!(fund.points.len() >= 50, "{name} SWPPX: {}", fund.points.len());
        }
    }
}
