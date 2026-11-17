; Tally was called Ledgerly until 0.1.3, and its binary and app identifier kept
; that name until 0.2.3. This runs after Tally installs and clears what those
; older versions leave behind. It never touches %APPDATA%\com.ledgerly.app: the
; app itself moves that folder (database, backups, settings) under the new
; identifier on its first launch, so the data is never handled by two things.
!macro NSIS_HOOK_POSTINSTALL
  ; 0.1.3 to 0.2.2 installed into the Tally folder but ran as ledgerly.exe.
  ; The installer retargets the shortcuts to the new binary; the old one is
  ; removed here in case the previous uninstaller did not run.
  Delete "$INSTDIR\ledgerly.exe"

  ; The WebView2 profile (cache and localStorage) was filed under the old
  ; identifier. It is rebuilt on first launch, so the old copy is just space.
  RMDir /r "$LOCALAPPDATA\com.ledgerly.app"

  ; Before 0.1.3 the app installed under its display name, Ledgerly. The
  ; installer files an app by that name, so without this an update would
  ; install Tally beside Ledgerly and leave Ledgerly's program, shortcuts and
  ; "Installed apps" entry behind. A Tally shortcut goes wherever a Ledgerly
  ; one was (an update only refreshes shortcuts that already exist under the
  ; new name).
  StrCpy $R9 "$LOCALAPPDATA\Ledgerly"
  ${If} "$INSTDIR" != "$R9"
  ${AndIf} ${FileExists} "$R9\ledgerly.exe"
    ${If} ${FileExists} "$SMPROGRAMS\Ledgerly.lnk"
      Delete "$SMPROGRAMS\Ledgerly.lnk"
      ${IfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
        CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      ${EndIf}
    ${EndIf}
    ${If} ${FileExists} "$DESKTOP\Ledgerly.lnk"
      Delete "$DESKTOP\Ledgerly.lnk"
      ${IfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
        CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
      ${EndIf}
    ${EndIf}
    Delete "$R9\ledgerly.exe"
    Delete "$R9\uninstall.exe"
    RMDir "$R9"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ledgerly"
    DeleteRegKey HKCU "Software\ledgerly\Ledgerly"
  ${EndIf}
!macroend
