!macro customInstall

!define REDIST_NAME "$\"Microsoft Visual C++ 2015-2019 Redistributable (x64) 14.26.28720.03$\""
!define REDIST_SETUP_URL "https://download.visualstudio.microsoft.com/download/pr/d60aa805-26e9-47df-b4e3-cd6fcc392333/7D7105C52FCD6766BEEE1AE162AA81E278686122C1E44890712326634D0B055E/VC_redist.x64.exe"
!define REDIST_SETUP_FILE "$TEMP\vcredist140-x64-installer.exe"

ClearErrors

ReadRegDword $R0 HKLM "SOFTWARE\Wow6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
IfErrors 0 +2
DetailPrint "Installing ${REDIST_NAME}..."
StrCmp $R0 "1" 0 +3
  DetailPrint "${REDIST_NAME} is already installed. Skipping."
  Goto End

DetailPrint "Downloading ${REDIST_NAME} Setup (from ${REDIST_SETUP_URL} to ${REDIST_SETUP_FILE}) ..."
NSISdl::download /TIMEOUT=30000 "${REDIST_SETUP_URL}" "${REDIST_SETUP_FILE}"

Pop $R0 ; get the return value
StrCmp $R0 "success" OnSuccessDownload

Pop $R0 ; get the return value
StrCmp $R0 "success" +2
  MessageBox MB_OK "Could not download ${REDIST_NAME} (from ${REDIST_SETUP_URL} to ${REDIST_SETUP_FILE}). Please install it manually."
  Goto End

OnSuccessDownload:
  DetailPrint "Running ${REDIST_NAME} Setup (${REDIST_SETUP_FILE} executable)..."
  ExecWait '"${REDIST_SETUP_FILE}" /norestart'
  DetailPrint "Finished ${REDIST_NAME} Setup"
  Delete "${REDIST_SETUP_FILE}"

End:

!macroend
