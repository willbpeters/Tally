//! Carrying an install over from the app's original name, Ledgerly.
//!
//! The app identifier changed from `com.ledgerly.app` to `com.tally.app`, and
//! the identifier names the `%APPDATA%` folder that holds the database, the
//! backups, the backup settings and the device-sync identity. Without this,
//! the first launch after the rename would open an empty database beside a
//! full one.
use std::fs;
use std::path::PathBuf;

const LEGACY_FOLDER: &str = "com.ledgerly.app";
const DB_FILE: &str = "finance.sqlite";

/// The folder to run from: `wanted`, after moving a pre-rename folder beside
/// it into place when there is one and `wanted` holds no database yet.
///
/// The whole folder moves, not just the database, so backups, settings and
/// the sync identity stay together. A move that fails leaves everything where
/// it was and runs from the old folder, so a permissions hiccup can never
/// separate the owner from their data; the next launch tries again.
pub fn data_dir(wanted: PathBuf) -> PathBuf {
    let Some(parent) = wanted.parent() else { return wanted };
    let old = parent.join(LEGACY_FOLDER);
    if !old.join(DB_FILE).is_file() || wanted.join(DB_FILE).is_file() {
        return wanted;
    }
    // An empty folder may already exist (an earlier launch that found nothing
    // to adopt); only an empty one is removed, so nothing is ever discarded.
    if wanted.is_dir() && fs::remove_dir(&wanted).is_err() {
        eprintln!("rename: {} exists and is not empty; running from {}", wanted.display(), old.display());
        return old;
    }
    match fs::rename(&old, &wanted) {
        Ok(()) => wanted,
        Err(e) => {
            eprintln!("rename: couldn't move {} to {}: {e}; running from the old folder", old.display(), wanted.display());
            old
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn legacy_dir(wanted: &Path) -> PathBuf {
        wanted.parent().expect("an app data dir has a parent").join(LEGACY_FOLDER)
    }

    fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let wanted = root.path().join("com.tally.app");
        let old = legacy_dir(&wanted);
        (root, wanted, old)
    }

    fn populate(dir: &Path) {
        fs::create_dir_all(dir.join("backups")).unwrap();
        fs::write(dir.join(DB_FILE), "db").unwrap();
        fs::write(dir.join("device-sync.json"), "{}").unwrap();
        fs::write(dir.join("backups").join("ledgerly-2026-10-14-093012-daily.sqlite"), "old backup").unwrap();
    }

    #[test]
    fn a_pre_rename_folder_moves_into_place_with_everything_in_it() {
        let (_root, wanted, old) = setup();
        populate(&old);

        assert_eq!(data_dir(wanted.clone()), wanted);
        assert!(!old.exists(), "the old folder is gone, not copied");
        assert_eq!(fs::read_to_string(wanted.join(DB_FILE)).unwrap(), "db");
        assert!(wanted.join("device-sync.json").is_file());
        assert!(wanted.join("backups").join("ledgerly-2026-10-14-093012-daily.sqlite").is_file());
    }

    #[test]
    fn an_empty_new_folder_does_not_block_the_move() {
        let (_root, wanted, old) = setup();
        populate(&old);
        fs::create_dir_all(&wanted).unwrap();

        assert_eq!(data_dir(wanted.clone()), wanted);
        assert!(wanted.join(DB_FILE).is_file());
        assert!(!old.exists());
    }

    #[test]
    fn a_new_folder_with_a_database_is_left_alone() {
        let (_root, wanted, old) = setup();
        populate(&old);
        fs::create_dir_all(&wanted).unwrap();
        fs::write(wanted.join(DB_FILE), "new").unwrap();

        assert_eq!(data_dir(wanted.clone()), wanted);
        assert_eq!(fs::read_to_string(wanted.join(DB_FILE)).unwrap(), "new");
        assert_eq!(fs::read_to_string(old.join(DB_FILE)).unwrap(), "db", "the old folder is untouched");
    }

    #[test]
    fn a_new_folder_holding_other_files_is_never_removed() {
        let (_root, wanted, old) = setup();
        populate(&old);
        fs::create_dir_all(&wanted).unwrap();
        fs::write(wanted.join("backup-settings.json"), "{}").unwrap();

        // Nothing is discarded; the app keeps running from the old folder.
        assert_eq!(data_dir(wanted.clone()), old);
        assert!(wanted.join("backup-settings.json").is_file());
        assert!(old.join(DB_FILE).is_file());
    }

    #[test]
    fn nothing_to_adopt_means_the_wanted_folder_as_is() {
        let (_root, wanted, old) = setup();
        assert_eq!(data_dir(wanted.clone()), wanted);
        assert!(!wanted.exists(), "nothing is created here; setup does that");
        assert!(!old.exists());

        // An old folder without a database (say, only a stray settings file)
        // is not an install to adopt.
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("backup-settings.json"), "{}").unwrap();
        assert_eq!(data_dir(wanted.clone()), wanted);
        assert!(old.is_dir());
    }
}
