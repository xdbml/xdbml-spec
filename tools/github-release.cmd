@echo off
setlocal enabledelayedexpansion

REM ===========================================================================
REM  Tag a version and create its GitHub release, with notes generated from
REM  CHANGELOG.md so nothing is retyped.
REM
REM  Usage, from the repo root:
REM      tools\github-release.cmd 0.4
REM      tools\github-release.cmd 0.4 --prerelease
REM
REM  Needs the GitHub CLI:  winget install GitHub.cli   then   gh auth login
REM  Without it, the script writes the notes file and prints exactly what to
REM  do by hand, rather than leaving you to work it out.
REM ===========================================================================

if "%~1"=="" (
  echo ERROR: no version given.
  echo   usage: tools\github-release.cmd 0.4 [--prerelease]
  exit /b 1
)
set VER=%~1
set PRERELEASE=
if /i "%~2"=="--prerelease" set PRERELEASE=--prerelease
set ROOT=%CD%
set NOTES=%ROOT%\RELEASE-NOTES-v%VER%.md

if not exist "%ROOT%\CHANGELOG.md" (
  echo ERROR: run this from the repo root, not from tools\.
  exit /b 1
)

echo.
echo ============================================================
echo  GitHub release v%VER%
echo ============================================================

REM --- notes, generated from the CHANGELOG -----------------------------------
call node scripts\release-notes.mjs %VER% --out RELEASE-NOTES-v%VER%.md
if errorlevel 1 (
  echo ERROR: no CHANGELOG section for v%VER%. Add one, then rerun.
  exit /b 1
)

REM --- working tree must be clean --------------------------------------------
for /f %%s in ('git status --porcelain ^| find /v "RELEASE-NOTES" ^| find /c /v ""') do set DIRTY=%%s
if not "%DIRTY%"=="0" (
  echo ERROR: %DIRTY% uncommitted change(s). A tag should point at a pushed
  echo        commit, so commit and push before tagging.
  exit /b 1
)

REM --- local HEAD must match the remote --------------------------------------
call git fetch origin main --quiet
for /f %%h in ('git rev-parse HEAD') do set LOCAL=%%h
for /f %%h in ('git rev-parse origin/main') do set REMOTE=%%h
if not "%LOCAL%"=="%REMOTE%" (
  echo ERROR: HEAD and origin/main differ. Push first, so the tag points at
  echo        the commit everyone else sees.
  exit /b 1
)

REM --- tag --------------------------------------------------------------------
call git rev-parse v%VER% >nul 2>&1
if not errorlevel 1 (
  echo   tag v%VER% already exists locally, leaving it alone.
) else (
  call git tag -a v%VER% -F "%NOTES%" || goto :fail
  echo   tagged v%VER%
)
call git push origin v%VER% || goto :fail
echo   pushed tag v%VER%

REM --- release ----------------------------------------------------------------
where gh >nul 2>&1
if errorlevel 1 goto :nogh

call gh auth status >nul 2>&1
if errorlevel 1 (
  echo   gh is installed but not authenticated.  Run: gh auth login
  goto :nogh
)

call gh release view v%VER% >nul 2>&1
if not errorlevel 1 (
  echo   release v%VER% already exists, updating its notes.
  call gh release edit v%VER% --notes-file "%NOTES%" %PRERELEASE% || goto :fail
) else (
  call gh release create v%VER% --title "xDBML v%VER%" --notes-file "%NOTES%" %PRERELEASE% || goto :fail
)
call gh release view v%VER% --web
del "%NOTES%" >nul 2>&1
echo.
echo   Done. Release v%VER% is live.
cd /d "%ROOT%"
exit /b 0

:nogh
echo.
echo ============================================================
echo  The tag is pushed. The GitHub CLI is not available, so
echo  create the release by hand:
echo.
echo    1. https://github.com/xdbml/xdbml-spec/releases/new?tag=v%VER%
echo    2. Title: xDBML v%VER%
echo    3. Paste the contents of:
echo       %NOTES%
if defined PRERELEASE echo    4. Tick "Set as a pre-release"
echo.
echo  To script it next time:  winget install GitHub.cli
echo                           gh auth login
echo ============================================================
cd /d "%ROOT%"
exit /b 0

:fail
echo.
echo  FAILED in %CD%. Fix the error above and rerun; the script is
echo  idempotent: an existing tag is left alone and an existing
echo  release has its notes updated rather than duplicated.
cd /d "%ROOT%"
exit /b 1
