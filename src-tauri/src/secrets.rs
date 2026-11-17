//! Secrets live in the OS credential store (Windows Credential Manager),
//! never in SQLite or logs. Keys are short identifiers like
//! "simplefin_access_url".
use keyring::{Entry, Error};

const SERVICE: &str = "Tally";
/// The service name before the rename. A secret found there is moved under
/// `SERVICE` the first time it is read, so an existing install keeps its bank
/// connection without the owner noticing anything happened.
const LEGACY_SERVICE: &str = "Ledgerly";

fn entry(service: &str, key: &str) -> Result<Entry, String> {
    Entry::new(service, key).map_err(|e| format!("Credential store unavailable: {e}"))
}

fn read(service: &str, key: &str) -> Result<Option<String>, String> {
    match entry(service, key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Couldn't read from the credential store: {e}")),
    }
}

fn remove(service: &str, key: &str) -> Result<(), String> {
    match entry(service, key)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Couldn't remove from the credential store: {e}")),
    }
}

/// Read a secret. `Ok(None)` when nothing is stored under `key`.
pub fn get(key: &str) -> Result<Option<String>, String> {
    if let Some(v) = read(SERVICE, key)? {
        return Ok(Some(v));
    }
    // Not under the current name: adopt one saved before the rename.
    let Some(v) = read(LEGACY_SERVICE, key)? else { return Ok(None) };
    set(key, &v)?;
    // Best effort: a stale copy under the old name is harmless, and failing
    // to clean it up must not hide the secret we just found.
    let _ = remove(LEGACY_SERVICE, key);
    Ok(Some(v))
}

pub fn set(key: &str, value: &str) -> Result<(), String> {
    entry(SERVICE, key)?
        .set_password(value)
        .map_err(|e| format!("Couldn't save to the credential store: {e}"))
}

/// Remove a secret. Succeeds if it was already absent. Clears the pre-rename
/// copy too, so a disconnect cannot be undone by the adoption in `get`.
pub fn delete(key: &str) -> Result<(), String> {
    remove(SERVICE, key)?;
    remove(LEGACY_SERVICE, key)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Round-trips a value through the real Windows Credential Manager under a
    /// throwaway key, then removes it. Ignored by default because it touches
    /// the machine's credential store; run with
    /// `cargo test credential_store_round_trip -- --ignored`.
    #[test]
    #[ignore = "touches the OS credential store"]
    fn credential_store_round_trip() {
        const KEY: &str = "tally_test_round_trip";
        // Start clean even if a previous run died halfway.
        delete(KEY).unwrap();
        assert_eq!(get(KEY).unwrap(), None, "should start with nothing stored");

        set(KEY, "https://user:pass@example.com/simplefin").unwrap();
        assert_eq!(
            get(KEY).unwrap().as_deref(),
            Some("https://user:pass@example.com/simplefin")
        );

        // Overwriting replaces rather than erroring.
        set(KEY, "https://user:pass2@example.com/simplefin").unwrap();
        assert_eq!(
            get(KEY).unwrap().as_deref(),
            Some("https://user:pass2@example.com/simplefin")
        );

        delete(KEY).unwrap();
        assert_eq!(get(KEY).unwrap(), None, "delete should remove the entry");
        // Deleting again is a no-op, not an error.
        delete(KEY).unwrap();
    }

    /// A secret saved under the old service name is found, moved under the
    /// new one, and gone from the old one afterwards.
    #[test]
    #[ignore = "touches the OS credential store"]
    fn a_secret_under_the_old_name_is_adopted() {
        const KEY: &str = "tally_test_legacy_adopt";
        delete(KEY).unwrap();
        entry(LEGACY_SERVICE, KEY).unwrap().set_password("legacy-value").unwrap();

        assert_eq!(get(KEY).unwrap().as_deref(), Some("legacy-value"));
        assert_eq!(read(SERVICE, KEY).unwrap().as_deref(), Some("legacy-value"), "moved under the new name");
        assert_eq!(read(LEGACY_SERVICE, KEY).unwrap(), None, "and removed from the old one");

        delete(KEY).unwrap();
    }
}
