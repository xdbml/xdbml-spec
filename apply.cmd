@echo off
setlocal
REM Installs the resumable release.cmd, then finishes the 0.6.2 release.
REM Usage:  apply.cmd                 (repo at C:\Repos\Hackolade\xdbml-spec)
REM         apply.cmd D:\path\to\xdbml-spec
set REPO=C:\Repos\Hackolade\xdbml-spec
if not "%~1"=="" set REPO=%~1
if not exist "%REPO%\tools\release.cmd" (
  echo ERROR: no xdbml-spec repository at %REPO%
  echo        Pass its path: apply.cmd D:\path\to\xdbml-spec
  exit /b 1
)
copy /Y "%~dp0tools\release.cmd" "%REPO%\tools\release.cmd" >nul || exit /b 1
copy /Y "%~dp0tools\RELEASE.md" "%REPO%\tools\RELEASE.md" >nul || exit /b 1
cd /d "%REPO%" || exit /b 1
call tools\release.cmd 0.6.2
exit /b %errorlevel%
