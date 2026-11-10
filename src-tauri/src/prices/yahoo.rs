use serde_json::Value;

/// Window for the ordinary price refresh: just enough for latest and previous.
pub const RECENT_RANGE: &str = "5d";
/// Window for the history backfill. Two years of daily closes is enough for
/// beta, volatility and drawdown without making the response unwieldy, and it
/// costs the same single request as the short window.
pub const HISTORY_RANGE: &str = "2y";

/// Yahoo Finance public chart endpoint for a ticker's daily bars over `range`.
pub fn chart_url(ticker: &str, range: &str) -> String {
    format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range={}",
        ticker.trim().to_uppercase(),
        range
    )
}

fn unix_to_date(secs: i64) -> String {
    use chrono::{TimeZone, Utc};
    Utc.timestamp_opt(secs, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_default()
}

/// Parse Yahoo chart JSON into (YYYY-MM-DD, close) rows, oldest first.
/// Skips null closes; adds the meta regular-market price when it is from a
/// later day than the last bar (see `parse_chart_result`).
pub fn parse_chart_json(body: &str) -> Vec<(String, f64)> {
    let v: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    parse_chart_result(&v["chart"]["result"][0])
}

/// One chart result object, as found under `chart.result[0]` — and, in the
/// same shape, under each `spark.result[].response[0]` of the batch endpoint.
pub fn parse_chart_result(result: &Value) -> Vec<(String, f64)> {
    let mut out = Vec::new();
    if let (Some(ts), Some(closes)) = (
        result["timestamp"].as_array(),
        result["indicators"]["quote"][0]["close"].as_array(),
    ) {
        for (t, c) in ts.iter().zip(closes.iter()) {
            if let (Some(secs), Some(close)) = (t.as_i64(), c.as_f64()) {
                out.push((unix_to_date(secs), close));
            }
        }
    }

    // A mutual fund's bar for the day appears with a blank close and stays
    // blank for hours after its NAV is published; the NAV itself is only in
    // the meta. Without this, yesterday's NAV stood as the latest price all
    // evening and the portfolio read a whole day's move short. The meta's day
    // is New York's: a NAV published at 8 pm is already tomorrow in UTC.
    let meta = &result["meta"];
    if let (Some(price), Some(secs)) = (
        meta["regularMarketPrice"].as_f64(),
        meta["regularMarketTime"].as_i64(),
    ) {
        let date = unix_to_date(secs + meta["gmtoffset"].as_i64().unwrap_or(0));
        if out.last().is_none_or(|(last, _)| *last < date) {
            out.push((date, price));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_url_asks_for_two_years_of_daily_closes() {
        let url = chart_url("vti", HISTORY_RANGE);
        assert!(url.contains("range=2y"), "{url}");
        assert!(url.contains("interval=1d"), "{url}");
        assert!(url.contains("/VTI?"), "{url}");
    }

    #[test]
    fn the_ordinary_refresh_still_asks_for_a_short_window() {
        assert!(chart_url("aapl", RECENT_RANGE).contains("range=5d"));
    }

    #[test]
    fn builds_uppercase_url() {
        assert_eq!(
            chart_url("aapl", RECENT_RANGE),
            "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d"
        );
    }

    #[test]
    fn parses_daily_closes_oldest_first_and_skips_nulls() {
        let body = r#"{"chart":{"result":[{
            "meta":{"regularMarketPrice":320.0,"regularMarketTime":1788552000},
            "timestamp":[1788206400,1788292800,1788552000],
            "indicators":{"quote":[{"close":[315.5,null,320.0]}]}
        }]}}"#;
        let rows = parse_chart_json(body);
        assert_eq!(rows.len(), 2); // the null close is skipped
        assert_eq!(rows[0].1, 315.5);
        assert_eq!(rows[1].1, 320.0);
    }

    #[test]
    fn falls_back_to_meta_price_when_no_daily_arrays() {
        let body = r#"{"chart":{"result":[{
            "meta":{"regularMarketPrice":100.25,"regularMarketTime":1788552000}
        }]}}"#;
        let rows = parse_chart_json(body);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].1, 100.25);
    }

    // What Yahoo sent for SWPPX on the evening of Mon 2026-11-09: the day's bar
    // was there with a blank close, and the NAV it had just published (19.52)
    // was only in the meta. Friday's 19.07 stood as the "latest" price.
    #[test]
    fn todays_nav_is_taken_from_the_meta_while_todays_bar_is_still_blank() {
        let body = r#"{"chart":{"result":[{
            "meta":{"regularMarketPrice":19.52,"regularMarketTime":1794268437,"gmtoffset":-18000},
            "timestamp":[1793975400,1794234600],
            "indicators":{"quote":[{"close":[19.07,null]}]}
        }]}}"#;
        let rows = parse_chart_json(body);
        assert_eq!(rows, vec![("2026-11-06".to_string(), 19.07), ("2026-11-09".to_string(), 19.52)]);
    }

    #[test]
    fn a_nav_published_after_midnight_utc_keeps_its_new_york_date() {
        // 20:30 New York on the 9th is 01:30 UTC on the 10th.
        let body = r#"{"chart":{"result":[{
            "meta":{"regularMarketPrice":19.52,"regularMarketTime":1794274200,"gmtoffset":-18000},
            "timestamp":[1793975400],
            "indicators":{"quote":[{"close":[19.07]}]}
        }]}}"#;
        let rows = parse_chart_json(body);
        assert_eq!(rows.last(), Some(&("2026-11-09".to_string(), 19.52)));
    }

    #[test]
    fn returns_empty_on_garbage() {
        assert!(parse_chart_json("not json").is_empty());
        assert!(parse_chart_json(r#"{"chart":{"result":[]}}"#).is_empty());
    }
}
