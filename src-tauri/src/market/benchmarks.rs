//! What a fund tracks, as a small static map in the spirit of `budget/mcc.rs`.
//! An unknown fund gets no label rather than a guess.

const MAP: &[(&str, &str)] = &[
    ("SWPPX", "S&P 500"),
    ("VOO", "S&P 500"),
    ("SPY", "S&P 500"),
    ("IVV", "S&P 500"),
    ("SWLGX", "US large-cap growth"),
    ("SWSSX", "US small-cap"),
    ("SWISX", "MSCI EAFE (international)"),
    ("SWTSX", "US total market"),
    ("VTI", "US total market"),
    ("QQQ", "Nasdaq 100"),
];

pub fn tracks_for(ticker: &str) -> Option<&'static str> {
    let t = ticker.trim().to_uppercase();
    MAP.iter().find(|(sym, _)| *sym == t).map(|(_, label)| *label)
}

/// An ETF that tracks the same index as a mutual fund, so the fund's moves
/// through the day can be estimated from it: a fund has one price a day, set
/// after the close, while the ETF trades all day. Each pair was checked against
/// three months of daily moves (Nov 2026); the worst misses by 0.12% a day on
/// average, and international funds miss most because their prices are
/// fair-valued at foreign closes.
const PROXIES: &[(&str, &str)] = &[
    ("SWLGX", "IWF"),  // correlation 0.999
    ("SWPPX", "IVV"),  // 0.998
    ("SWTSX", "ITOT"), // 0.998
    ("SWSSX", "IWM"),  // 0.998
    ("SWISX", "EFA"),  // 0.983
    ("SFNNX", "FNDF"), // 0.975
];

pub fn proxy_for(ticker: &str) -> Option<&'static str> {
    let t = ticker.trim().to_uppercase();
    PROXIES.iter().find(|(sym, _)| *sym == t).map(|(_, etf)| *etf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_funds_get_a_label_and_unknown_ones_get_nothing() {
        assert_eq!(tracks_for("SWPPX"), Some("S&P 500"));
        assert_eq!(tracks_for("swppx"), Some("S&P 500"), "case-insensitive");
        assert_eq!(tracks_for("SOMEFUND"), None, "never guess");
    }

    #[test]
    fn known_funds_get_a_tracking_etf_and_unknown_ones_get_nothing() {
        assert_eq!(proxy_for("swppx"), Some("IVV"));
        assert_eq!(proxy_for("GOOG"), None, "a stock has its own intraday prices");
        assert_eq!(proxy_for("SOMEFUND"), None, "never guess");
    }
}
