!macro customInstall

!define REDIST_NAME "$\"Microsoft Visual C++ 2015-2019 Redistributable (x64) 14.26.28720.03$\""
!define REDIST_SETUP_URL "https://download.visualstudio.microsoft.com/download/pr/d60aa805-26e9-47df-b4e3-cd6fcc392333/7D7105C52FCD6766BEEE1AE162AA81E278686122C1E44890712326634D0B055E/VC_redist.x64.exe"
!define REDIST_SETUP_FILE "$TEMP\vcredist140-x64-installer.exe"

ClearErrors

ReadRegDword $R0 HKLM "SOFTWARE\Wow6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
IfErrors Download
IntCmp $R0 1 0 Download
  DetailPrint "${REDIST_NAME} is already installed. Skipping."
  Goto End

Download:
  DetailPrint "Downloading ${REDIST_NAME} Setup (from ${REDIST_SETUP_URL} to ${REDIST_SETUP_FILE}) ..."
  NSISdl::download /TIMEOUT=30000 "${REDIST_SETUP_URL}" "${REDIST_SETUP_FILE}"
  Pop $R0
  StrCmp $R0 "success" OnSuccessDownload
  StrCmp $R0 "cancel" End
  DetailPrint "Could not download ${REDIST_NAME} (from ${REDIST_SETUP_URL} to ${REDIST_SETUP_FILE})."
  Goto End

OnSuccessDownload:
  DetailPrint "Running ${REDIST_NAME} Setup (${REDIST_SETUP_FILE} executable)..."
  # TODO use "IfSilent" test to apply "/quiet" arg only if NSIS setup was executed with "\S" flag
  ExecWait '"${REDIST_SETUP_FILE}" /quiet /norestart'
  DetailPrint "Finished ${REDIST_NAME} Setup"
  Delete "${REDIST_SETUP_FILE}"

End:

!macroend
